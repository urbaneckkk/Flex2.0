sp_BuscarLogin	ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION	CREATE DEFINER=`root`@`%` PROCEDURE `sp_BuscarLogin`(
\n    IN Login VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
\n    IN CNPJ  VARCHAR(50)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
\n)\nBEGIN
\n    SELECT U.idUsuario,
\n           U.nome,
\n           U.login,
\n           U.senha,
\n           U.fAtivo,
\n           U.cargo_id,
\n           E.idEmpresa,
\n           E.nome AS nomeEmpresa
\n    FROM Usuario U
\n    INNER JOIN Empresa E ON E.idEmpresa = U.idEmpresa
\n    WHERE U.login  = Login
\n      AND E.cnpj   = CNPJ
\n      AND U.fAtivo = 1
\n      AND E.fAtivo = 1;
\nEND	utf8mb4	utf8mb4_0900_ai_ci	utf8mb4_unicode_ci
