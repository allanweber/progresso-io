import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso — Progresso IO",
  description: "Termos de Uso da plataforma Progresso IO.",
};

const sections = [
  {
    title: "1. Aceitação dos termos",
    body: "Ao criar uma conta ou utilizar o Progresso IO, você concorda com estes Termos de Uso. Se não concordar, não utilize a plataforma. Podemos atualizar estes termos periodicamente, e o uso contínuo do serviço após alterações significa que você as aceita.",
  },
  {
    title: "2. Descrição do serviço",
    body: "O Progresso IO é uma plataforma de gestão para coaches e personal trainers, incluindo gestão de alunos, treinos, dietas, acompanhamento de evolução e comunicação. O serviço é oferecido no estado em que se encontra e pode evoluir ao longo do tempo.",
  },
  {
    title: "3. Cadastro e conta",
    body: "Você é responsável por manter a confidencialidade das suas credenciais e por todas as atividades realizadas na sua conta. As informações fornecidas no cadastro devem ser verdadeiras e mantidas atualizadas.",
  },
  {
    title: "4. Planos e pagamento",
    body: "Alguns recursos exigem um plano pago. Os valores, limites e condições de cada plano são apresentados no momento da contratação. Você pode cancelar a qualquer momento; cancelamentos passam a valer no próximo ciclo de cobrança.",
  },
  {
    title: "5. Uso aceitável",
    body: "Você concorda em não utilizar a plataforma para fins ilícitos, em não tentar acessar áreas ou dados de outros usuários, e em não comprometer a segurança ou a disponibilidade do serviço.",
  },
  {
    title: "6. Conteúdo e propriedade",
    body: "O conteúdo que você cadastra (alunos, treinos, dietas) permanece seu. A marca, o software e a interface do Progresso IO são de nossa propriedade e não podem ser copiados ou redistribuídos sem autorização.",
  },
  {
    title: "7. Limitação de responsabilidade",
    body: "O Progresso IO é uma ferramenta de organização e não substitui avaliação profissional, médica ou nutricional. Não nos responsabilizamos por decisões tomadas com base nas informações registradas na plataforma.",
  },
  {
    title: "8. Encerramento",
    body: "Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar contas que violem estes termos, mediante aviso quando possível.",
  },
  {
    title: "9. Contato",
    body: "Dúvidas sobre estes termos podem ser enviadas pela nossa página de Contato.",
  },
];

export default function TermsPage() {
  return (
    <>
      <h1 className="font-heading text-[32px] font-bold tracking-[-0.02em] text-foreground">
        Termos de Uso
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
