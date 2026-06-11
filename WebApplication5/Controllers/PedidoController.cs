// ===== PedidoController.cs =====
using Microsoft.AspNetCore.Mvc;
using WebApplication5.Models;
using WebApplication5.Services;

namespace WebApplication5.Controllers
{
    public class PedidoController : BaseController
    {
        private readonly PedidoService _service;
        private readonly AuditoriaService _auditoria;
        private readonly MLService _ml;

        public PedidoController(PedidoService service, AuditoriaService auditoria, MLService ml)
        {
            _service = service;
            _auditoria = auditoria;
            _ml = ml;
        }

        public IActionResult Index()
        {
            var r = VerificarSessao(); if (r != null) return r;
            return View();
        }

        public IActionResult Listar()
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            var idEmpresa = HttpContext.Session.GetInt32("IdEmpresa")!.Value;
            return Json(_service.Listar(idEmpresa));
        }

        public IActionResult ListarItens(int idPedido)
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            return Json(_service.ListarItens(idPedido));
        }

        [HttpPost]
        public IActionResult Criar([FromBody] PedidoCriarDto dto)
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            var idEmpresa = HttpContext.Session.GetInt32("IdEmpresa")!.Value;
            var idUsuario = HttpContext.Session.GetInt32("idUsuario")!.Value;
            try
            {
                var idGerado = _service.Criar(dto, idEmpresa, idUsuario);
                Auditar("PEDIDO", "CRIAR", $"Pedido #{idGerado} criado");
                return Ok(new { idPedido = idGerado });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { mensagem = ex.Message });
            }
            catch (Exception ex)
            {
                // Loga e devolve mensagem útil em vez de 500 genérico
                return StatusCode(500, new { mensagem = "Erro interno ao criar pedido.", detalhe = ex.Message });
            }
        }

        [HttpPost]
        public IActionResult AtualizarStatus([FromBody] AtualizarStatusPedidoDto dto)
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            var idUsuario = HttpContext.Session.GetInt32("idUsuario")!.Value;
            try
            {
                _service.AtualizarStatus(dto.IdPedido, dto.StatusPedidoId, idUsuario);
                Auditar("PEDIDO", "ALTERAR_STATUS", $"Pedido #{dto.IdPedido} -> status {dto.StatusPedidoId}");
                return Ok();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { mensagem = ex.Message });
            }
        }

        [HttpPost]
        public IActionResult Cancelar([FromBody] int idPedido)
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            var idUsuario = HttpContext.Session.GetInt32("idUsuario")!.Value;
            try
            {
                _service.Cancelar(idPedido, idUsuario);
                Auditar("PEDIDO", "CANCELAR", $"Pedido #{idPedido} cancelado");
                return Ok();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { mensagem = ex.Message });
            }
        }

        [HttpPost]
        public IActionResult Editar([FromBody] PedidoEditarDto dto)
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            var idEmpresa = HttpContext.Session.GetInt32("IdEmpresa")!.Value;
            var idUsuario = HttpContext.Session.GetInt32("idUsuario")!.Value;
            try
            {
                _service.Editar(dto, idEmpresa, idUsuario);
                Auditar("PEDIDO", "EDITAR", $"Pedido #{dto.IdPedido} editado");
                return Ok();
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { mensagem = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { mensagem = "Erro interno ao editar pedido.", detalhe = ex.Message });
            }
        }

        public IActionResult ListarPagamentos(int idPedido)
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            return Json(_service.ListarPagamentos(idPedido));
        }

        public IActionResult ListarHistoricoStatus(int idPedido)
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            return Json(_service.ListarHistoricoStatus(idPedido));
        }

        /// <summary>Alias esperado pelo pedido.js.</summary>
        public IActionResult ListarHistorico(int idPedido) => ListarHistoricoStatus(idPedido);

        [HttpGet]
        public async Task<IActionResult> PredicaoMlCancelamento(int idPedido)
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            var idEmpresa = HttpContext.Session.GetInt32("IdEmpresa")!.Value;

            var f = _service.BuscarFeaturesPredicaoMlCancelamento(idEmpresa, idPedido);
            if (f == null) return NotFound();

            var req = new CancelamentoRequest
            {
                Canal = f.canal ?? "PROPRIO",
                ValorTotal = f.valorTotal,
                ValorFrete = f.valorFrete,
                Desconto = f.Desconto,
                TipoClienteId = f.tipoCliente_id,
                GeneroCliente = string.IsNullOrWhiteSpace(f.generoCliente) ? "N" : f.generoCliente,
                SaldoDevedor = f.saldoDevedor,
                DiasClienteCadastrado = f.diasClienteCadastrado,
                TotalItens = f.totalItens,
                TotalUnidades = f.totalUnidades,
                DescontoMedioItem = f.descontoMedioItem,
                MaiorValorUnitario = f.maiorValorUnitario,
                MudancasStatus = f.mudancasStatus,
                DiasNoFunil = f.diasNoFunil,
                FormasPagamentoUsadas = f.formasPagamentoUsadas,
                TotalPago = f.totalPago,
                DiaSemana = f.diaSemana,
                Mes = f.mes,
            };

            var pred = await _ml.PredictCancelamento(req);
            if (pred == null) return StatusCode(503, new { erro = "Serviço ML indisponível" });
            return Json(pred);
        }

        public IActionResult TotalPago(int idPedido)
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            var total = _service.BuscarTotalPago(idPedido);
            return Json(new { totalPago = total });
        }

        [HttpPost]
        public IActionResult Pagar([FromBody] PagarPedidoDto dto)
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            var idEmpresa = HttpContext.Session.GetInt32("IdEmpresa")!.Value;
            var idUsuario = HttpContext.Session.GetInt32("idUsuario")!.Value;

            if (dto.Valor <= 0)
                return BadRequest(new { mensagem = "Valor deve ser maior que zero." });

            try
            {
                var resultado = _service.PagarPedido(dto, idEmpresa, idUsuario);
                var descAuditoria = resultado.Concluido
                    ? $"Pedido #{dto.IdPedido} CONCLUIDO - pago R$ {dto.Valor:F2}"
                    : $"Pedido #{dto.IdPedido} - pagamento parcial R$ {dto.Valor:F2}";
                Auditar("PEDIDO", resultado.Concluido ? "CONCLUIR" : "PAGAMENTO_PARCIAL", descAuditoria);
                return Ok(resultado);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { mensagem = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { mensagem = "Erro interno ao registrar pagamento.", detalhe = ex.Message });
            }
        }

        private void Auditar(string modulo, string acao, string descricao)
        {
            _auditoria.Registrar(new RegistrarAuditoriaDto
            {
                IdEmpresa = HttpContext.Session.GetInt32("IdEmpresa") ?? 0,
                IdUsuario = HttpContext.Session.GetInt32("idUsuario"),
                NomeUsuario = HttpContext.Session.GetString("nomeUsuario"),
                Modulo = modulo,
                Acao = acao,
                Descricao = descricao,
                IpUsuario = HttpContext.Connection.RemoteIpAddress?.ToString()
            });
        }
    }
}