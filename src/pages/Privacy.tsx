import { Link } from "react-router-dom";
import kivoLogo from "@/assets/kivo-logo.svg";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <img src={kivoLogo} alt="Kivo" className="h-7" />
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 prose prose-neutral dark:prose-invert max-w-none">
        <h1>Política de Privacidade</h1>
        <p className="text-muted-foreground">Última atualização: 5 de abril de 2026</p>

        <p>
          A <strong>Kivo</strong> ("nós", "nosso") opera a plataforma disponível em{" "}
          <a href="https://kivostore.lovable.app" className="text-primary hover:underline">
            kivostore.lovable.app
          </a>{" "}
          (o "Serviço"). Esta política descreve como coletamos, usamos e protegemos seus dados pessoais.
        </p>

        <h2>1. Dados que Coletamos</h2>
        <h3>1.1 Dados fornecidos por você</h3>
        <ul>
          <li><strong>Cadastro:</strong> nome, e-mail, senha (hash), CPF/CNPJ (quando aplicável).</li>
          <li><strong>Perfil:</strong> foto, bio, links de redes sociais.</li>
          <li><strong>Transações:</strong> dados de pagamento processados por terceiros (ASAAS, Pagar.me). Não armazenamos dados completos de cartão.</li>
          <li><strong>Conteúdo:</strong> posts, comentários, arquivos enviados em comunidades e cursos.</li>
        </ul>

        <h3>1.2 Dados coletados automaticamente</h3>
        <ul>
          <li><strong>Navegação:</strong> páginas visitadas, cliques, tempo de permanência.</li>
          <li><strong>Dispositivo:</strong> tipo de navegador, sistema operacional, resolução de tela.</li>
          <li><strong>Rede:</strong> endereço IP (anonimizado para analytics), geolocalização aproximada.</li>
          <li><strong>Cookies:</strong> identificadores de sessão e preferências.</li>
        </ul>

        <h2>2. Como Usamos seus Dados</h2>
        <ul>
          <li>Fornecer, manter e melhorar o Serviço.</li>
          <li>Processar pagamentos e emitir notas fiscais.</li>
          <li>Enviar comunicações transacionais (confirmações, alertas de segurança).</li>
          <li>Enviar comunicações de marketing (com consentimento; você pode cancelar a qualquer momento).</li>
          <li>Detectar fraudes e garantir segurança da plataforma.</li>
          <li>Gerar analytics agregados e anonimizados.</li>
        </ul>

        <h2>3. Compartilhamento de Dados</h2>
        <p>Compartilhamos dados pessoais apenas nas seguintes situações:</p>
        <ul>
          <li><strong>Processadores de pagamento:</strong> ASAAS, Pagar.me — para processar transações.</li>
          <li><strong>Infraestrutura:</strong> Supabase (banco de dados, autenticação), Vercel (hospedagem).</li>
          <li><strong>Criadores de conteúdo:</strong> dados necessários para entrega do produto adquirido (nome, e-mail).</li>
          <li><strong>Obrigação legal:</strong> quando exigido por lei, regulação ou ordem judicial.</li>
        </ul>
        <p>Não vendemos seus dados pessoais a terceiros.</p>

        <h2>4. Armazenamento e Segurança</h2>
        <ul>
          <li>Dados armazenados em servidores seguros com criptografia em trânsito (TLS) e em repouso.</li>
          <li>Senhas armazenadas com hash bcrypt.</li>
          <li>Acesso restrito por políticas de Row-Level Security (RLS) no banco de dados.</li>
          <li>Backups automáticos diários.</li>
        </ul>

        <h2>5. Seus Direitos (LGPD)</h2>
        <p>De acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a:</p>
        <ul>
          <li>Acessar seus dados pessoais.</li>
          <li>Corrigir dados incompletos ou incorretos.</li>
          <li>Solicitar anonimização ou exclusão de dados desnecessários.</li>
          <li>Revogar consentimento para comunicações de marketing.</li>
          <li>Solicitar portabilidade dos seus dados.</li>
          <li>Solicitar exclusão completa da sua conta e dados associados.</li>
        </ul>
        <p>
          Para exercer qualquer direito, entre em contato pelo e-mail:{" "}
          <a href="mailto:privacidade@kivo.com.br" className="text-primary hover:underline">
            privacidade@kivo.com.br
          </a>
        </p>

        <h2>6. Retenção de Dados</h2>
        <ul>
          <li>Dados de conta: mantidos enquanto a conta estiver ativa.</li>
          <li>Dados fiscais e de transação: mantidos por 5 anos conforme legislação fiscal.</li>
          <li>Logs de acesso: mantidos por 6 meses (Marco Civil da Internet).</li>
          <li>Após exclusão de conta: dados pessoais removidos em até 30 dias, exceto obrigações legais.</li>
        </ul>

        <h2>7. Cookies</h2>
        <p>Utilizamos cookies para:</p>
        <ul>
          <li><strong>Essenciais:</strong> autenticação e sessão do usuário.</li>
          <li><strong>Analytics:</strong> entender uso da plataforma (dados agregados).</li>
          <li><strong>Preferências:</strong> tema, idioma, configurações de UI.</li>
        </ul>
        <p>Você pode gerenciar cookies nas configurações do seu navegador.</p>

        <h2>8. Menores de Idade</h2>
        <p>
          O Serviço é destinado a maiores de 18 anos. Não coletamos intencionalmente dados de menores de idade. 
          Se identificarmos dados de menor, serão excluídos imediatamente.
        </p>

        <h2>9. Alterações nesta Política</h2>
        <p>
          Podemos atualizar esta política periodicamente. Notificaremos alterações significativas por e-mail ou 
          aviso no Serviço. O uso continuado após alterações constitui aceitação.
        </p>

        <h2>10. Contato</h2>
        <p>
          Para dúvidas sobre privacidade:{" "}
          <a href="mailto:privacidade@kivo.com.br" className="text-primary hover:underline">
            privacidade@kivo.com.br
          </a>
        </p>

        <div className="mt-12 pt-6 border-t text-sm text-muted-foreground text-center">
          <Link to="/terms" className="text-primary hover:underline mr-4">
            Termos de Uso
          </Link>
          <Link to="/" className="text-primary hover:underline">
            Voltar ao início
          </Link>
        </div>
      </main>
    </div>
  );
}
