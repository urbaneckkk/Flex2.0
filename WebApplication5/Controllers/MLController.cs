// Controllers/MLController.cs
// Controller que o frontend JavaScript chama via fetch/Ajax.
// Não chama o Flask direto do JS (evita expor a porta 5001 ao navegador).

using Microsoft.AspNetCore.Mvc;
using WebApplication5.Services;
using System;
using System.Threading.Tasks;

namespace WebApplication5.Controllers
{
    [Route("ml")]
    public class MLController : Controller
    {
        private readonly MLService _ml;

        public MLController(MLService ml)
        {
            _ml = ml;
        }

        // ── GET /ml/ruptura-estoque
        // Chamado pelo dashboard e pela tela de Estoque
        [HttpGet("ruptura-estoque")]
        public async Task<IActionResult> RupturaEstoque()
        {
            var idEmpresa = HttpContext.Session.GetInt32("IdEmpresa");
            if (idEmpresa == null) return Unauthorized();

            var resultado = await _ml.GetRupturaEstoque(idEmpresa.Value);
            return Json(resultado);
        }

        // ── POST /ml/cancelamento
        // Chamado ao abrir o detalhe de um pedido
        [HttpPost("cancelamento")]
        public async Task<IActionResult> Cancelamento([FromBody] CancelamentoRequest req)
        {
            if (req == null) return BadRequest();
            var resultado = await _ml.PredictCancelamento(req);
            if (resultado == null) return StatusCode(503, new { erro = "Serviço ML indisponível" });
            return Json(resultado);
        }

        // ── POST /ml/inadimplencia
        // Chamado ao abrir o detalhe de um cliente ou criar conta a receber
        [HttpPost("inadimplencia")]
        public async Task<IActionResult> Inadimplencia([FromBody] InadimplenciaRequest req)
        {
            if (req == null) return BadRequest();
            var resultado = await _ml.PredictInadimplencia(req);
            if (resultado == null) return StatusCode(503, new { erro = "Serviço ML indisponível" });
            return Json(resultado);
        }

        // ── GET /ml/status
        // Verifica se a API Flask está no ar (útil para o dashboard)
        [HttpGet("status")]
        public async Task<IActionResult> Status()
        {
            var ok = await _ml.IsAvailable();
            return Json(new { disponivel = ok });
        }
    }
}