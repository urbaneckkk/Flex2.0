namespace WebApplication5.Models
{
    /// <summary>
    /// Mapeia o resultado de sp_ListarMovimentacaoEstoque.
    /// Campos da SP:
    ///   dthMovimentacao, NomeProduto, TipoMovimentacao,
    ///   Quantidade, Motivo, IdUsuario, NomeUsuario
    /// </summary>
    public class EstoqueHistoricoDto
    {
        // A SP retorna "NomeProduto" — Dapper faz o bind por convenção
        public DateTime dthMovimentacao { get; set; }
        public string nomeProduto { get; set; } = string.Empty;

        // SP retorna "TipoMovimentacao" (ENTRADA / SAIDA / AJUSTE)
        // Coluna mapeada via alias direto
        public string tipo { get; set; } = string.Empty;

        // SP retorna "Quantidade"
        public int quantidade { get; set; }

        // SP retorna "Motivo" (= coluna Observacao da tabela)
        public string? motivo { get; set; }

        // SP retorna "NomeUsuario"
        public string? nomeUsuario { get; set; }

        // SP não retorna lote — campo opcional, fica null
        public string? lote { get; set; }
    }
}