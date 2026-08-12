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
    price: "R$ 199",
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
    price: "R$ 399",
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
      label: "Entrar em contato",
      href: "mailto:contato@progressoio.com.br",
    },
    dark: true,
  },
];
