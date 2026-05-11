using WebApplication5.Models;
using WebApplication5.Repositories;

namespace WebApplication5.Services
{
    public class EstoqueHistoricoService
    {
        private readonly EstoqueHistoricoRepository _repo;

        public EstoqueHistoricoService(EstoqueHistoricoRepository repo)
        {
            _repo = repo;
        }

        public IEnumerable<EstoqueHistoricoDto> Listar(int idEmpresa)
            => _repo.Listar(idEmpresa);
    }
}