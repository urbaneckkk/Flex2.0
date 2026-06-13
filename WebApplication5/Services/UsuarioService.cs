using MySql.Data.MySqlClient;
using WebApplication5.Exceptions;
using WebApplication5.Models;
using WebApplication5.Repositories;

namespace WebApplication5.Services
{
    public class UsuarioService
    {
        private readonly UsuarioRepository _repo;
        private readonly SenhaService _password;

        public UsuarioService(UsuarioRepository repo, SenhaService password)
        {
            _repo = repo;
            _password = password;
        }

        public IEnumerable<UsuarioModel> Listar(int idEmpresa)
            => _repo.Listar(idEmpresa);

        public void Criar(UsuarioModel usuario)
        {
            try
            {
                usuario.Senha = _password.Hash(usuario.Senha);
                usuario.dthCriacao = DateTime.Now;
                usuario.fAtivo = true;

                // CPF vazio vira null para não disparar unique constraint
                if (string.IsNullOrWhiteSpace(usuario.CPF))
                    usuario.CPF = null;

                _repo.Inserir(usuario);
            }
            catch (MySqlException ex) when (ex.Number == 1062)
            {
                throw new RegraNegocioException(ResolverMensagem1062(ex.Message));
            }
        }

        public void Editar(UsuarioModel usuario)
        {
            try
            {
                if (!string.IsNullOrEmpty(usuario.Senha))
                    usuario.Senha = _password.Hash(usuario.Senha);

                // CPF vazio vira null para não disparar unique constraint
                if (string.IsNullOrWhiteSpace(usuario.CPF))
                    usuario.CPF = null;

                _repo.Atualizar(usuario);
            }
            catch (MySqlException ex) when (ex.Number == 1062)
            {
                throw new RegraNegocioException(ResolverMensagem1062(ex.Message));
            }
        }

        public void AlterarStatus(int idUsuario)
            => _repo.AlterarStatus(idUsuario);

        // Identifica qual campo causou o Duplicate Entry
        private static string ResolverMensagem1062(string errorMessage)
        {
            var msg = errorMessage.ToLower();
            if (msg.Contains("cpf")) return "CPF já cadastrado para outro usuário.";
            if (msg.Contains("login")) return "Login já está em uso. Escolha outro.";
            if (msg.Contains("email")) return "E-mail já cadastrado para outro usuário.";
            return "Dado duplicado: já existe um registro com essas informações.";
        }
    }
}