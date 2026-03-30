import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dir = path.join(__dirname, 'src', 'pages', 'editor');
const files = fs.readdirSync(dir).filter(f => f.endsWith('Flow.tsx'));

files.forEach(f => {
    let content = fs.readFileSync(path.join(dir, f), 'utf-8');
    let hasChanges = false;
    
    // Add import if not present
    if (!content.includes('RichTextEditor')) {
        content = content.replace(/(import .* from [\"']lucide-react[\"'];?)/, '\$1\nimport { RichTextEditor } from "@/components/RichTextEditor";');
        hasChanges = true;
    }

    // Replace description Textarea
    const descRegex = /<Textarea\s+placeholder=\"([^\"]+)\"\s+value=\{form\.description\}\s+onChange=\{e => updateForm\(\{description: e\.target\.value\}\)\}\s+rows=\{[0-9]+\}\s+className=\"[^\"]+\"\s+\/>/g;
    if (descRegex.test(content)) {
        content = content.replace(descRegex, '<RichTextEditor placeholder="$1" value={form.description} onChange={v => updateForm({description: v})} />');
        hasChanges = true;
    }

    // Replace confirmationBody Textarea
    const confRegex = /<Textarea[\s\S]*?value=\{form\.confirmationBody\}\s*onChange=\{e => updateForm\(\{confirmationBody: e\.target\.value\}\)\}[\s\S]*?\/>/g;
    
    if (confRegex.test(content)) {
        content = content.replace(confRegex, '<RichTextEditor value={form.confirmationBody} onChange={v => updateForm({confirmationBody: v})} variables={[{label:"Nome do Cliente",value:"nome_cliente"},{label:"Seu Nome",value:"meu_nome"},{label:"Seu Username",value:"meu_username"},{label:"Nome do Produto",value:"nome_produto"},{label:"Link / Arquivos",value:"arquivos_produto"}]} />');
        hasChanges = true;
    }

    // Replace reminderBody Textarea
    const remRegex = /<Textarea[\s\S]*?value=\{form\.reminderBody\}\s*onChange=\{e => updateForm\(\{reminderBody: e\.target\.value\}\)\}[\s\S]*?\/>/g;
    
    if (remRegex.test(content)) {
        content = content.replace(remRegex, '<RichTextEditor value={form.reminderBody} onChange={v => updateForm({reminderBody: v})} variables={[{label:"Nome",value:"nome_cliente"},{label:"Data",value:"data_reuniao"},{label:"Hora",value:"hora_reuniao"},{label:"Link",value:"link_reuniao"}]} />');
        hasChanges = true;
    }

    if (hasChanges) {
        fs.writeFileSync(path.join(dir, f), content);
        console.log('Updated', f);
    }
});
