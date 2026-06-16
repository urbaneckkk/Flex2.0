using System.Net;
using System.Net.Mail;

public class EmailService
{
    private readonly string _host;
    private readonly int _port;
    private readonly string _usuario;
    private readonly string _senha;
    private readonly string _baseUrl;

    public EmailService(IConfiguration config)
    {
        _host    = config["Smtp:Host"]!;
        _port    = int.Parse(config["Smtp:Port"] ?? "587");
        _usuario = config["Smtp:Usuario"]!;
        _senha   = config["Smtp:Senha"]!;
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

        using var smtp = new SmtpClient(_host, _port)
        {
            Credentials = new NetworkCredential(_usuario, _senha),
            EnableSsl = true
        };

        using var msg = new MailMessage
        {
            From = new MailAddress(_usuario, "FlexGestor"),
            Subject = "Redefinição de senha — FlexGestor",
            Body = html,
            IsBodyHtml = true
        };
        msg.To.Add(new MailAddress(emailDestino, nomeUsuario));

        await smtp.SendMailAsync(msg);
        Console.WriteLine($"Email enviado para {emailDestino}");
    }
}
