using Dapper;
using MySql.Data.MySqlClient;
using WebApplication5.Models;

namespace WebApplication5.Repositories
{
    public class EstoqueHistoricoRepository
    {
        private readonly string _connStr;

        public EstoqueHistoricoRepository(string connStr)
        {
            _connStr = connStr;
        }

        public IEnumerable<EstoqueHistoricoDto> Listar(int idEmpresa)
        {
            using var conn = new MySqlConnection(_connStr);

            return conn.Query<EstoqueHistoricoDto>(
                "CALL sp_ListarMovimentacaoEstoque(@idEmpresa)",
                new { idEmpresa }
            );
        }
    }
}