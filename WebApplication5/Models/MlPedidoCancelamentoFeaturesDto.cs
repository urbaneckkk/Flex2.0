namespace WebApplication5.Models
{
    /// <summary>
    /// Mapeamento Dapper da mesma agregação usada em project_ml/Domain/data_loader.py (cancelamento).
    /// </summary>
    public sealed class MlPedidoCancelamentoFeaturesDto
    {
        public string canal { get; set; } = "";
        public decimal valorTotal { get; set; }
        public decimal valorFrete { get; set; }
        public decimal Desconto { get; set; }
        public int tipoCliente_id { get; set; }
        public string generoCliente { get; set; } = "N";
        public decimal saldoDevedor { get; set; }
        public int diasClienteCadastrado { get; set; }
        public int totalItens { get; set; }
        public int totalUnidades { get; set; }
        public decimal descontoMedioItem { get; set; }
        public decimal maiorValorUnitario { get; set; }
        public int mudancasStatus { get; set; }
        public int diasNoFunil { get; set; }
        public int formasPagamentoUsadas { get; set; }
        public decimal totalPago { get; set; }
        public int diaSemana { get; set; }
        public int mes { get; set; }
    }
}
