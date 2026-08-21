import {
  Calendar,
  Dumbbell,
  MessageCircle,
  Salad,
  Smartphone,
  TrendingUp,
  Users,
  UsersRound,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Highlighted "diferencial" card (WhatsApp). */
  featured?: boolean;
  /** Small eyebrow label above the title. */
  eyebrow?: string;
  /** Emerald border without the full gradient/solid-icon treatment. */
  accent?: boolean;
};

export const features: Feature[] = [
  {
    icon: MessageCircle,
    title: "WhatsApp Integrado",
    description:
      "Envie check-ins, lembretes de treino e cobranças automaticamente. Seu aluno responde no WhatsApp que já usa — sem instalar nada.",
    featured: true,
    eyebrow: "Diferencial",
  },
  {
    icon: Users,
    title: "Gestão de Alunos",
    description:
      "Ficha completa, evolução de peso, check-ins, histórico de treinos e dieta — tudo num perfil unificado.",
    eyebrow: "Mais usado",
    accent: true,
  },
  {
    icon: UsersRound,
    title: "Equipe de Coaches",
    description:
      "No plano Clínica, adicione até 3 treinadores na mesma conta e compartilhe alunos, dietas e treinos — cada coach com o seu acesso.",
    eyebrow: "Plano Clínica",
    accent: true,
  },
  {
    icon: Dumbbell,
    title: "Treinos com Substituições",
    description:
      "Monte fichas de treino com exercícios alternativos. O aluno vê as opções direto no app, sem precisar perguntar.",
  },
  {
    icon: Salad,
    title: "Dietas com Substituições de Alimentos",
    description:
      "Monte planos alimentares com opções de troca por refeição. Aluno consulta e substitui sem te chamar.",
  },
  {
    icon: Calendar,
    title: "Calendário e Agenda",
    description:
      "Avaliações, renovações e eventos num calendário compartilhado. Integra com Google Agenda.",
  },
  {
    icon: TrendingUp,
    title: "Evolução e Relatórios",
    description:
      "Gráficos de peso, medidas e adesão. Prove o resultado dos seus alunos com dados reais.",
  },
  {
    icon: Smartphone,
    title: "Aplicativo para o Aluno",
    description:
      "O aluno acessa treinos, dietas, progresso e feedback direto pela plataforma, sem precisar do WhatsApp para tudo.",
  },
  {
    icon: Zap,
    title: "Automação de Tarefas",
    description:
      "Mensagens automáticas para alunos, lembretes de eventos e compromissos. Menos trabalho manual, mais consistência.",
  },
];

export type Plan = {
  name: string;
  tagline: string;
  price: string;
  priceSuffix?: string;
  features: { label: string; included: boolean }[];
  cta: { label: string; href: string };
  popular?: boolean;
  dark?: boolean;
};

export const plans: Plan[] = [
  {
    name: "Free",
    tagline: "Para começar",
    price: "R$ 0",
    priceSuffix: "/mês",
    features: [
      { label: "Até 3 alunos", included: true },
      { label: "1 coach", included: true },
      { label: "Treinos e dietas", included: true },
      { label: "WhatsApp integrado", included: false },
      { label: "Calendário", included: false },
    ],
    cta: { label: "Começar grátis", href: "/register" },
  },
  {
    name: "Solo",
    tagline: "Para coaches solo",
    price: "R$ 179",
    priceSuffix: "/mês",
    features: [
      { label: "Até 50 alunos", included: true },
      { label: "1 coach", included: true },
      { label: "WhatsApp integrado", included: true },
      { label: "Substituições", included: true },
      { label: "Calendário completo", included: true },
    ],
    cta: { label: "Começar grátis", href: "/register" },
    popular: true,
  },
  {
    name: "Clínica",
    tagline: "Para equipes",
    price: "R$ 379",
    priceSuffix: "/mês",
    features: [
      { label: "Até 100 alunos", included: true },
      { label: "Até 3 coaches", included: true },
      { label: "Tudo do Solo", included: true },
      { label: "Relatórios avançados", included: true },
      { label: "Suporte prioritário", included: true },
    ],
    cta: { label: "Começar grátis", href: "/register" },
  },
  {
    name: "Enterprise",
    tagline: "Sob medida",
    price: "Preço personalizado",
    features: [
      { label: "Tudo da Clínica", included: true },
      { label: "Alunos e coaches ilimitados", included: true },
      { label: "Integrações customizadas", included: true },
      { label: "SLA e suporte dedicado", included: true },
    ],
    cta: {
      // `/contact`, not a `mailto:`. A mailto only does anything for a visitor
      // whose browser has a mail client registered — for everyone else the
      // click is silently inert, which is exactly what an Enterprise lead
      // experiences as "the button is broken". It also addressed
      // contato@progressoio.com.br, the only appearance of that domain in the
      // codebase, while every other contact route in the app (the footer, the
      // /contact form) reaches the team through CONTACT_EMAIL.
      label: "Entrar em contato",
      href: "/contact",
    },
    dark: true,
  },
];

/**
 * The features that get a screenshot, in order.
 *
 * Every one is a COACH screen. The coach is who pays for this, so the page
 * argues to them; the aluno's app appears once, as the secondary image in the
 * hero, because "your aluno gets an app" is a selling point *to the coach* and
 * not the product being sold.
 *
 * The images are crops of the real app, captured by the e2e suite
 * (`e2e/portfolio.spec.ts` → "landing assets"), so they cannot drift away from
 * what ships. Cropped rather than whole windows: a full 1440px screenshot in
 * this column would render at ~0.4 and be unreadable.
 */
export type Showcase = {
  title: string;
  description: string;
  image: string;
  alt: string;
};

export const showcase: Showcase[] = [
  {
    title: "A dieta fecha os números",
    description:
      "Monte a partir de um catálogo com a tabela TACO e veja kcal e macros somarem enquanto você digita. Cada alimento leva substituições, então o aluno troca o arroz pela mandioca sem te mandar mensagem.",
    image: "/landing/feat-diet.png",
    alt: "Refeição montada no Progresso IO: alimentos em gramas e kcal, substituições e o total da refeição",
  },
  {
    title: "Treino com técnica, não só uma lista",
    description:
      "Séries, repetições em sequência (10-8-6-4), descanso, carga e observação por exercício — com drop set e super set marcados na ficha. As alternativas aparecem para o aluno no app.",
    image: "/landing/feat-workout.png",
    alt: "Ficha de treino com séries, repetições, descanso, drop set, super set e substituições",
  },
  {
    title: "WhatsApp na mesma tela",
    description:
      "Caixa de entrada compartilhada, com a janela de 24 horas à vista em cada conversa. Fora dela só sai modelo aprovado — é a regra que derruba o número de quem a esconde.",
    image: "/landing/feat-whatsapp.png",
    alt: "Caixa de entrada do WhatsApp com as conversas, a janela aberta ou fechada e o tempo restante",
  },
  {
    title: "A agenda já sabe o que vence",
    description:
      "Consultorias, avaliações e renovações num calendário só — junto com os check-ins que vencem sozinhos, calculados a partir da rotina de cada aluno.",
    image: "/landing/feat-calendar.png",
    alt: "Calendário do mês com consultoria, avaliação física, check-in e renovação nos próximos 14 dias",
  },
];
