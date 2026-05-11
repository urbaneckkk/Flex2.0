// ===== PedidoRepository.cs =====
using Dapper;
using MySql.Data.MySqlClient;
using System.Data;
using WebApplication5.Models;

namespace WebApplication5.Repositories
{
    public class PedidoRepository
    {
        private readonly string _connectionString;

        public PedidoRepository(IConfiguration config)
            => _connectionString = config.GetConnectionString("Default")!;

        public IEnumerable<PedidoListaGridDto> Listar(int idEmpresa)
        {
            using var conn = new MySqlConnection(_connectionString);
            return conn.Query<PedidoListaGridDto>(
                "sp_ListarPedido",
                new { p_idEmpresa = idEmpresa },
                commandType: CommandType.StoredProcedure);
        }

        public void DeletarItens(int idPedido)
        {
            using var conn = new MySqlConnection(_connectionString);
            conn.Execute(
                "sp_DeletarItensPedido",
                new { p_idPedido = idPedido },
                commandType: CommandType.StoredProcedure);
        }

        public void AtualizarCabecalho(int idPedido, decimal valorTotal,
            decimal desconto, decimal valorFrete, string? observacao)
        {
            using var conn = new MySqlConnection(_connectionString);
            conn.Execute(
                "sp_AtualizarCabecalhoPedido",
                new
                {
                    p_idPedido = idPedido,
                    p_valorTotal = valorTotal,
                    p_Desconto = desconto,
                    p_valorFrete = valorFrete,
                    p_Observacao = observacao
                },
                commandType: CommandType.StoredProcedure);
        }

        public int Inserir(PedidoModel pedido)
        {
            using var conn = new MySqlConnection(_connectionString);
            return conn.ExecuteScalar<int>(
                "sp_CriarPedido",
                new
                {
                    p_cliente_id = pedido.IdCliente,
                    p_usuario_id = pedido.IdUsuario,
                    p_idEmpresa = pedido.IdEmpresa,
                    p_endereco_id = pedido.EnderecoId > 0 ? pedido.EnderecoId : (int?)null,
                    p_canal = pedido.Canal ?? "PROPRIO",
                    p_numeroExterno = pedido.NumeroExterno,
                    p_statusPedido_id = pedido.StatusPedidoId,
                    p_valorTotal = pedido.ValorTotal,
                    p_valorFrete = pedido.ValorFrete,
                    p_Desconto = pedido.Desconto,
                    p_Observacao = pedido.Observacao
                },
                commandType: CommandType.StoredProcedure);
        }

        public void InserirItem(PedidoItemModel item)
        {
            using var conn = new MySqlConnection(_connectionString);
            conn.Execute(
                "sp_CriarItemPedido",
                new
                {
                    p_idPedido = item.IdPedido,
                    p_idProduto = item.IdProduto,
                    p_quantidade = item.Quantidade,
                    p_valorUnitario = item.ValorUnitario,
                    p_desconto = item.Desconto,
                    p_valorTotal = item.ValorTotal
                },
                commandType: CommandType.StoredProcedure);
        }

        public IEnumerable<PedidoItemGridDto> ListarItens(int idPedido)
        {
            using var conn = new MySqlConnection(_connectionString);
            return conn.Query<PedidoItemGridDto>(
                "sp_ListarItensPedido",
                new { p_idPedido = idPedido },
                commandType: CommandType.StoredProcedure);
        }

        public void AtualizarStatus(int idPedido, int statusPedidoId,
            int idUsuario, string? observacao = null)
        {
            using var conn = new MySqlConnection(_connectionString);
            conn.Execute(
                "sp_AtualizarStatusPedido",
                new
                {
                    p_idPedido = idPedido,
                    p_statusPedido_id = statusPedidoId,
                    p_idUsuario = idUsuario,
                    p_observacao = observacao
                },
                commandType: CommandType.StoredProcedure);
        }

        public void Cancelar(int idPedido, int idUsuario)
        {
            using var conn = new MySqlConnection(_connectionString);
            conn.Execute(
                "sp_CancelarPedido",
                new { p_idPedido = idPedido, p_idUsuario = idUsuario },
                commandType: CommandType.StoredProcedure);
        }

        public void DeletarPagamentos(int idPedido)
        {
            using var conn = new MySqlConnection(_connectionString);
            conn.Execute(
                "DELETE FROM PedidoPagamento WHERE idPedido = @idPedido",
                new { idPedido });
        }

        public void InserirPagamento(PedidoPagamentoModel pagamento)
        {
            using var conn = new MySqlConnection(_connectionString);
            conn.Execute(
                "INSERT INTO PedidoPagamento (idPedido, formaPagamento_id, valor, dthPagamento) VALUES (@idPedido, @formaPagamento_id, @valor, @dthPagamento)",
                new
                {
                    idPedido = pagamento.IdPedido,
                    formaPagamento_id = pagamento.FormaPagamento_id,
                    valor = pagamento.Valor,
                    dthPagamento = DateTime.Now
                });
        }

        public IEnumerable<PedidoPagamentoModel> ListarPagamentos(int idPedido)
        {
            using var conn = new MySqlConnection(_connectionString);
            return conn.Query<PedidoPagamentoModel>(
                "sp_ListarPagamentosPedido",
                new { p_idPedido = idPedido },
                commandType: CommandType.StoredProcedure);
        }

        public IEnumerable<dynamic> ListarHistoricoStatus(int idPedido)
        {
            using var conn = new MySqlConnection(_connectionString);
            return conn.Query(
                "sp_ListarHistoricoStatus",
                new { p_idPedido = idPedido },
                commandType: CommandType.StoredProcedure);
        }

        // ── NOVO: total pago via caixa para um pedido ──
        public decimal BuscarTotalPago(int idPedido)
        {
            using var conn = new MySqlConnection(_connectionString);
            return conn.ExecuteScalar<decimal>(
                "sp_BuscarTotalPagoPedido",
                new { p_idPedido = idPedido },
                commandType: CommandType.StoredProcedure);
        }

        // ── NOVO: registra pagamento no caixa via SP e retorna resultado ──
        public PagarPedidoResultado PagarPedido(PagarPedidoDto dto, int idEmpresa, int idUsuario)
        {
            using var conn = new MySqlConnection(_connectionString);
            try
            {
                var result = conn.QueryFirstOrDefault<PagarPedidoResultado>(
                    "sp_PagarPedido",
                    new
                    {
                        p_idPedido = dto.IdPedido,
                        p_idEmpresa = idEmpresa,
                        p_idUsuario = idUsuario,
                        p_idFormaPagamento = dto.IdFormaPagamento,
                        p_idCategoriaFinanceira = dto.IdCategoriaFinanceira,
                        p_valor = dto.Valor,
                        p_descricao = dto.Descricao
                    },
                    commandType: CommandType.StoredProcedure);

                return result ?? throw new InvalidOperationException("Erro ao processar pagamento.");
            }
            catch (MySql.Data.MySqlClient.MySqlException ex)
                when (ex.Message.Contains("Nenhum caixa aberto"))
            {
                throw new InvalidOperationException(ex.Message);
            }
        }

        /// <summary>
        /// Agregação espelha project_ml Domain/data_loader.py carregar_pedidos (por pedido).
        /// </summary>
        public MlPedidoCancelamentoFeaturesDto? BuscarFeaturesPredicaoMlCancelamento(int idEmpresa, int idPedido)
        {
            const string sql = @"
            SELECT
                p.canal                                       AS canal,
                p.valorTotal                                  AS valorTotal,
                COALESCE(p.valorFrete, 0)                     AS valorFrete,
                COALESCE(p.Desconto, 0)                       AS Desconto,
                COALESCE(c.tipoCliente_id, 0)                 AS tipoCliente_id,
                COALESCE(c.Genero, 'N')                       AS generoCliente,
                COALESCE(c.saldoDevedor, 0)                   AS saldoDevedor,
                DATEDIFF(p.dthPedido, c.dthCadastro)          AS diasClienteCadastrado,
                COUNT(DISTINCT pi.idPedidoItem)               AS totalItens,
                COALESCE(SUM(pi.quantidade), 0)               AS totalUnidades,
                COALESCE(AVG(pi.desconto), 0)                 AS descontoMedioItem,
                COALESCE(MAX(pi.valorUnitario), 0)            AS maiorValorUnitario,
                COUNT(DISTINCT h.idHistorico)                 AS mudancasStatus,
                COALESCE(DATEDIFF(
                    MAX(h.dthAlteracao),
                    MIN(h.dthAlteracao)
                ), 0)                                         AS diasNoFunil,
                COUNT(DISTINCT pp.idPagamento)                AS formasPagamentoUsadas,
                COALESCE(SUM(pp.valor), 0)                    AS totalPago,
                DAYOFWEEK(p.dthPedido)                        AS diaSemana,
                MONTH(p.dthPedido)                            AS mes
            FROM Pedido p
            INNER JOIN Cliente c ON c.idCliente = p.cliente_id
            LEFT JOIN PedidoItem pi ON pi.idPedido = p.idPedido
            LEFT JOIN PedidoStatusHistorico h ON h.idPedido = p.idPedido
            LEFT JOIN PedidoPagamento pp ON pp.idPedido = p.idPedido
            WHERE p.statusPedido_id IS NOT NULL
              AND p.idEmpresa = @idEmpresa
              AND p.idPedido = @idPedido
            GROUP BY
                p.idPedido,
                p.idEmpresa,
                p.canal,
                p.valorTotal,
                p.valorFrete,
                p.Desconto,
                p.statusPedido_id,
                c.tipoCliente_id,
                c.Genero,
                c.saldoDevedor,
                c.dthCadastro,
                p.dthPedido;
            ";

            using var conn = new MySqlConnection(_connectionString);
            return conn.QueryFirstOrDefault<MlPedidoCancelamentoFeaturesDto>(sql,
                new { idEmpresa, idPedido });
        }
    }
}