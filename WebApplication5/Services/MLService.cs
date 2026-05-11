// Services/MLService.cs
// Consome a API Flask do módulo ML do FlexGestor.
// Injete via DI no Startup.cs como Scoped ou Singleton.

using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace WebApplication5.Services
{
    // ─── DTOs de request ───────────────────────────────────
    public class CancelamentoRequest
    {
        public string Canal { get; set; }
        public decimal ValorTotal { get; set; }
        public decimal ValorFrete { get; set; }
        public decimal Desconto { get; set; }
        public int TipoClienteId { get; set; }
        public string GeneroCliente { get; set; }
        public decimal SaldoDevedor { get; set; }
        public int DiasClienteCadastrado { get; set; }
        public int TotalItens { get; set; }
        public int TotalUnidades { get; set; }
        public decimal DescontoMedioItem { get; set; }
        public decimal MaiorValorUnitario { get; set; }
        public int MudancasStatus { get; set; }
        public int DiasNoFunil { get; set; }
        public int FormasPagamentoUsadas { get; set; }
        public decimal TotalPago { get; set; }
        public int DiaSemana { get; set; }
        public int Mes { get; set; }
    }

    public class InadimplenciaRequest
    {
        public decimal ValorTotal { get; set; }
        public int PrazoConcessao { get; set; }
        public int TipoClienteId { get; set; }
        public string Genero { get; set; }
        public decimal SaldoDevedor { get; set; }
        public int IdadeClienteDias { get; set; }
        public int QtdContasAnteriores { get; set; }
        public int QtdAtrasoAnteriores { get; set; }
        public decimal ValorPedidoOrigem { get; set; }
        public string CanalOrigem { get; set; }
        public int Mes { get; set; }
    }

    // ─── DTOs de response ──────────────────────────────────
    public class MLRiscoResponse
    {
        public double Probabilidade { get; set; }
        public string Risco { get; set; }  // BAIXO | MEDIO | ALTO
        public string Cor { get; set; }  // hex color
        public string Label { get; set; }
    }

    public class RupturaItem
    {
        public int IdProduto { get; set; }
        public double ProbabilidadeRuptura { get; set; }
        public string Risco { get; set; }
        public string Cor { get; set; }
        public double DiasEstoqueRestante { get; set; }
        public double GiroDiario { get; set; }
        public int EstoqueAtual { get; set; }
        public int EstoqueMinimo { get; set; }
        public int Vendido30d { get; set; }
    }

    // ─── Serviço ───────────────────────────────────────────
    public class MLService
    {
        private readonly HttpClient _http;
        private readonly ILogger<MLService> _logger;
        private readonly string _baseUrl;

        // Serialization options: camelCase pra bater com o Flask
        private static readonly JsonSerializerOptions _jsonOpts = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
        };

        public MLService(IHttpClientFactory factory, IConfiguration config, ILogger<MLService> logger)
        {
            _http = factory.CreateClient("ML");
            _logger = logger;
            _baseUrl = config["MLApi:BaseUrl"] ?? "http://localhost:5001";
        }

        // ── Risco de cancelamento de um pedido ─────────────
        public async Task<MLRiscoResponse> PredictCancelamento(CancelamentoRequest req)
        {
            try
            {
                var body = JsonSerializer.Serialize(req, _jsonOpts);
                var content = new StringContent(body, Encoding.UTF8, "application/json");
                var resp = await _http.PostAsync($"{_baseUrl}/predict/cancelamento", content);

                resp.EnsureSuccessStatusCode();
                var json = await resp.Content.ReadAsStringAsync();

                var result = JsonSerializer.Deserialize<JsonElement>(json);
                return new MLRiscoResponse
                {
                    Probabilidade = result.GetProperty("probabilidade_cancelamento").GetDouble(),
                    Risco = result.GetProperty("risco").GetString(),
                    Cor = result.GetProperty("cor").GetString(),
                    Label = result.GetProperty("label").GetString(),
                };
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "MLService: falha ao predizer cancelamento.");
                return null; // Frontend lida com null graciosamente
            }
        }

        // ── Risco de inadimplência de um cliente ───────────
        public async Task<MLRiscoResponse> PredictInadimplencia(InadimplenciaRequest req)
        {
            try
            {
                var body = JsonSerializer.Serialize(req, _jsonOpts);
                var content = new StringContent(body, Encoding.UTF8, "application/json");
                var resp = await _http.PostAsync($"{_baseUrl}/predict/inadimplencia", content);

                resp.EnsureSuccessStatusCode();
                var json = await resp.Content.ReadAsStringAsync();

                var result = JsonSerializer.Deserialize<JsonElement>(json);
                return new MLRiscoResponse
                {
                    Probabilidade = result.GetProperty("probabilidade_inadimplencia").GetDouble(),
                    Risco = result.GetProperty("risco").GetString(),
                    Cor = result.GetProperty("cor").GetString(),
                    Label = result.GetProperty("label").GetString(),
                };
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "MLService: falha ao predizer inadimplência.");
                return null;
            }
        }

        // ── Ruptura de estoque por empresa (batch) ──────────
        public async Task<List<RupturaItem>> GetRupturaEstoque(int idEmpresa)
        {
            try
            {
                var resp = await _http.GetAsync($"{_baseUrl}/predict/ruptura/{idEmpresa}");
                resp.EnsureSuccessStatusCode();
                var json = await resp.Content.ReadAsStringAsync();

                return JsonSerializer.Deserialize<List<RupturaItem>>(json, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                    PropertyNameCaseInsensitive = true,
                }) ?? new List<RupturaItem>();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "MLService: falha ao buscar ruptura de estoque.");
                return new List<RupturaItem>();
            }
        }

        // ── Health check ────────────────────────────────────
        public async Task<bool> IsAvailable()
        {
            try
            {
                var resp = await _http.GetAsync($"{_baseUrl}/health");
                return resp.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }
    }
}