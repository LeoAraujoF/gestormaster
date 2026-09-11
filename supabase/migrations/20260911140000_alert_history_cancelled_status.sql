-- Status 'cancelled' para mensagem interrompida pelo operador.
--
-- Contexto: em 11/09/2026 lembretes da régua das 18h05 do dia anterior saíram de
-- manhã, e não havia como cancelá-los. Os freios existentes eram três, nenhum
-- visível como "cancelar esta mensagem":
--   - pausar a régua inteira em /automacao (muda o significado: desliga a régua)
--   - parar a campanha em massa (só campanha de leads)
--   - remover o job no Bull Board (master admin, ferramenta crua)
--
-- Sem um status próprio, cancelar obrigaria a gravar 'failed', misturando
-- "o operador cancelou" com "o envio falhou" no mesmo histórico — e é justamente
-- essa distinção que a tela de fila precisa mostrar.
--
-- ALTER TYPE ... ADD VALUE é aditivo e não reescreve a tabela. Fica sozinho nesta
-- migration de propósito: o Postgres não permite usar um valor de enum recém
-- criado na mesma transação que o criou.

ALTER TYPE public.alert_send_status ADD VALUE IF NOT EXISTS 'cancelled';

COMMENT ON TYPE public.alert_send_status IS
  'Estado do envio. cancelled = interrompido pelo operador antes de sair (diferente de failed, que é tentativa que deu erro).';
