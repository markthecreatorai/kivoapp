import { Link } from "react-router-dom";
import kivoLogo from "@/assets/kivo-logo.svg";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
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
        <h1>Termos de Uso</h1>
        <p className="text-muted-foreground">Última atualização: 5 de abril de 2026</p>

        <p>
          Ao acessar ou usar a plataforma <strong>Kivo</strong> ("Serviço"), você concorda com estes Termos de Uso.
          Se não concordar, não utilize o Serviço.
        </p>

        <h2>1. Definições</h2>
        <ul>
          <li><strong>Plataforma:</strong> o software e serviços disponíveis em {window.location.host}.</li>
          <li><strong>Criador:</strong> pessoa física ou jurídica que utiliza o Serviço para vender produtos digitais, cursos ou comunidades.</li>
          <li><strong>Comprador/Aluno:</strong> pessoa que adquire produtos ou participa de comunidades na plataforma.</li>
          <li><strong>Conteúdo:</strong> qualquer material publicado na plataforma (textos, imagens, vídeos, arquivos).</li>
        </ul>

        <h2>2. Cadastro e Conta</h2>
        <ul>
          <li>Você deve ter pelo menos 18 anos para criar uma conta.</li>
          <li>As informações de cadastro devem ser verdadeiras e atualizadas.</li>
          <li>Você é responsável por manter a segurança da sua senha e conta.</li>
          <li>Uma pessoa ou entidade pode manter apenas uma conta (exceto contas de workspace autorizadas).</li>
          <li>Reservamo-nos o direito de suspender contas que violem estes termos.</li>
        </ul>

        <h2>3. Uso da Plataforma</h2>
        <h3>3.1 Para Criadores</h3>
        <ul>
          <li>Você é responsável pelo conteúdo que publica e vende.</li>
          <li>Deve cumprir todas as leis aplicáveis, incluindo direitos autorais, defesa do consumidor e tributação.</li>
          <li>Não é permitido vender conteúdo ilegal, fraudulento, difamatório ou que viole direitos de terceiros.</li>
          <li>Você é responsável pelo suporte e entrega dos produtos vendidos.</li>
          <li>A Kivo atua como intermediadora de pagamento, não como vendedora dos produtos.</li>
        </ul>

        <h3>3.2 Para Compradores</h3>
        <ul>
          <li>Ao comprar, você concorda com os termos específicos do produto e do criador.</li>
          <li>Direito de arrependimento: 7 dias conforme o Código de Defesa do Consumidor (Art. 49), quando aplicável.</li>
          <li>Reembolsos são processados conforme a política do criador e a legislação vigente.</li>
        </ul>

        <h3>3.3 Para Membros de Comunidades</h3>
        <ul>
          <li>Respeite as regras da comunidade definidas pelo administrador.</li>
          <li>Não publique spam, conteúdo ofensivo ou ilegal.</li>
          <li>O administrador da comunidade pode remover membros que violem as regras.</li>
        </ul>

        <h2>4. Pagamentos e Taxas</h2>
        <ul>
          <li>Pagamentos são processados por terceiros (ASAAS, Pagar.me).</li>
          <li>A Kivo cobra taxas de transação conforme o plano contratado pelo criador.</li>
          <li>Valores são em Reais (BRL) salvo indicação contrária.</li>
          <li>Repasses ao criador seguem o calendário definido pelo processador de pagamento.</li>
          <li>Chargebacks e disputas são tratados conforme política do processador e regulação vigente.</li>
        </ul>

        <h2>5. Propriedade Intelectual</h2>
        <ul>
          <li>A marca, software e design da Kivo são de propriedade exclusiva da plataforma.</li>
          <li>Criadores mantêm a propriedade intelectual sobre seu conteúdo.</li>
          <li>Ao publicar na plataforma, você concede à Kivo uma licença limitada para exibir e distribuir o conteúdo conforme necessário para operação do Serviço.</li>
          <li>Compradores recebem licença pessoal e intransferível de uso do conteúdo adquirido, salvo termos diferentes definidos pelo criador.</li>
        </ul>

        <h2>6. Proibições</h2>
        <p>É proibido:</p>
        <ul>
          <li>Usar o Serviço para atividades ilegais ou fraudulentas.</li>
          <li>Tentar acessar contas, dados ou sistemas sem autorização.</li>
          <li>Fazer engenharia reversa do software da plataforma.</li>
          <li>Enviar spam ou comunicações não solicitadas através da plataforma.</li>
          <li>Manipular métricas, avaliações ou sistemas de gamificação.</li>
          <li>Revender ou redistribuir conteúdo adquirido sem autorização.</li>
        </ul>

        <h2>7. Limitação de Responsabilidade</h2>
        <ul>
          <li>A Kivo fornece a plataforma "como está" e "conforme disponível".</li>
          <li>Não garantimos disponibilidade ininterrupta ou ausência de erros.</li>
          <li>Não somos responsáveis por conteúdo publicado por criadores ou membros.</li>
          <li>Nossa responsabilidade total é limitada ao valor pago pelo criador nos últimos 12 meses.</li>
          <li>Não somos responsáveis por danos indiretos, incidentais ou consequenciais.</li>
        </ul>

        <h2>8. Suspensão e Encerramento</h2>
        <ul>
          <li>Podemos suspender ou encerrar contas que violem estes termos.</li>
          <li>Você pode encerrar sua conta a qualquer momento nas configurações.</li>
          <li>Após encerramento, dados são tratados conforme nossa Política de Privacidade.</li>
          <li>Obrigações financeiras pendentes sobrevivem ao encerramento.</li>
        </ul>

        <h2>9. Modificações</h2>
        <p>
          Podemos modificar estes Termos a qualquer momento. Alterações significativas serão notificadas 
          com pelo menos 30 dias de antecedência. O uso continuado após as alterações constitui aceitação.
        </p>

        <h2>10. Legislação e Foro</h2>
        <p>
          Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de São Paulo/SP 
          para dirimir quaisquer controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja.
        </p>

        <h2>11. Contato</h2>
        <p>
          Para dúvidas sobre estes Termos:{" "}
          <a href="mailto:suporte@kivo.com.br" className="text-primary hover:underline">
            suporte@kivo.com.br
          </a>
        </p>

        <div className="mt-12 pt-6 border-t text-sm text-muted-foreground text-center">
          <Link to="/privacy" className="text-primary hover:underline mr-4">
            Política de Privacidade
          </Link>
          <Link to="/" className="text-primary hover:underline">
            Voltar ao início
          </Link>
        </div>
      </main>
    </div>
  );
}
