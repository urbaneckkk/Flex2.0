using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

public class EmailService
{
    private readonly string _apiKey;
    private readonly string _baseUrl;

    public EmailService(IConfiguration config)
    {
        _apiKey  = config["Resend:ApiKey"]!;
        _baseUrl = config["App:BaseUrl"]!;
    }

    public async Task EnviarResetSenha(string emailDestino, string nomeUsuario, string token)
    {
        var link = $"{_baseUrl}/Login/RedefinirSenha?token={token}";

        var html = $@"
            <div style='font-family:sans-serif;max-width:480px;margin:auto'>
                <h2>Redefinição de senha</h2>
                <p>Olá, <strong>{nomeUsuario}</strong>!</p>
                <p>Clique no botão abaixo para redefinir sua senha. O link expira em <strong>1 hora</strong>.</p>
                <a href='{link}' style='display:inline-block;margin:20px 0;padding:12px 24px;
                    background:#4f8eff;color:white;border-radius:8px;text-decoration:none;font-weight:600'>
                    Redefinir senha
                </a>
                <p style='color:#999;font-size:12px'>Se você não solicitou isso, ignore este email.</p>
            </div>";

        var payload = JsonSerializer.Serialize(new
        {
            from    = "FlexGestor <onboarding@resend.dev>",
            to      = new[] { emailDestino },
            subject = "Redefinição de senha — FlexGestor",
            html
        });

        using var http = new HttpClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);

        var response = await http.PostAsync(
            "https://api.resend.com/emails",
            new StringContent(payload, Encoding.UTF8, "application/json"));

        var body = await response.Content.ReadAsStringAsync();
        Console.WriteLine($"Resend status: {response.StatusCode} — {body}");

        if (!response.IsSuccessStatusCode)
            throw new Exception($"Falha ao enviar email: {response.StatusCode} — {body}");
    }
}
