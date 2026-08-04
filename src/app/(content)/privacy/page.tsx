import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidade — Progresso IO",
  description: "Política de Privacidade da plataforma Progresso IO.",
};

const sections = [
  {
    title: "1. Dados que coletamos",
    body: "Coletamos os dados que você fornece ao criar sua conta (nome e e-mail), os dados dos alunos e treinos que você cadastra, e dados técnicos de uso (como registros de acesso) necessários para operar e proteger o serviço.",
  },
  {
    title: "2. Como usamos os dados",
    body: "Utilizamos seus dados para fornecer e melhorar a plataforma, autenticar seu acesso, enviar comunicações essenciais (como códigos de verificação) e garantir a segurança da conta. Não vendemos seus dados.",
  },
  {
    title: "3. Base legal e LGPD",
    body: "O tratamento de dados segue a Lei Geral de Proteção de Dados (LGPD). Tratamos dados com base na execução do contrato, no cumprimento de obrigações legais e no legítimo interesse de operar o serviço com segurança.",
  },
  {
    title: "4. Compartilhamento",
    body: "Compartilhamos dados apenas com prestadores que viabilizam o serviço (por exemplo, provedores de e-mail e de infraestrutura), sempre no mínimo necessário e sob obrigações de confidencialidade.",
  },
  {
    title: "5. Cookies",
    body: "Utilizamos cookies estritamente necessários para manter sua sessão autenticada. Com o seu consentimento, também utilizamos cookies de análise (Google Analytics) para entender o uso e melhorar o produto — você pode recusá-los no aviso de cookies, sem prejuízo do funcionamento essencial. Não utilizamos cookies de publicidade.",
  },
  {
    title: "6. Segurança",
    body: "Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo criptografia de senhas e controle de acesso por perfil. Nenhum sistema é 100% seguro, mas trabalhamos continuamente para reduzir riscos.",
  },
  {
    title: "7. Seus direitos",
    body: "Você pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados, além de revogar consentimentos. Para exercer esses direitos, entre em contato pela nossa página de Contato.",
  },
  {
    title: "8. Retenção",
    body: "Mantemos seus dados enquanto sua conta estiver ativa e pelo período necessário para cumprir obrigações legais. Após isso, os dados são excluídos ou anonimizados.",
  },
  {
    title: "9. Contato",
    body: "Dúvidas sobre privacidade ou sobre o tratamento dos seus dados podem ser enviadas pela nossa página de Contato.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <h1 className="font-heading text-[32px] font-bold tracking-[-0.02em] text-foreground">
        Privacidade
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última atualização: 4 de agosto de 2026
      </p>

      <div className="mt-10 space-y-8">
        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="font-heading text-lg font-bold text-foreground">
              {section.title}
            </h2>
            <p className="text-sm leading-[1.7] text-muted-foreground">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
