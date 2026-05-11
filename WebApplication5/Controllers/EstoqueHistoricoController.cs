using Microsoft.AspNetCore.Mvc;
using WebApplication5.Services;

namespace WebApplication5.Controllers
{
    public class EstoqueHistoricoController : BaseController
    {
        private readonly EstoqueService _service;

        public EstoqueHistoricoController(EstoqueService service)
            => _service = service;

        public IActionResult Index()
        {
            var r = VerificarSessao(); if (r != null) return r;
            return View();
        }

        public IActionResult Listar()
        {
            var r = VerificarSessaoApi(); if (r != null) return r;
            var idEmpresa = HttpContext.Session.GetInt32("IdEmpresa")!.Value;
            return Json(_service.ListarMovimentacoes(idEmpresa));
        }
    }
}