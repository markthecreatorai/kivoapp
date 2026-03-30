import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Braces, Link as LinkIcon } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface DynamicVariable {
  label: string;
  value: string;
}

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables?: DynamicVariable[];
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({ 
  value, 
  onChange, 
  variables = [], 
  placeholder,
  className,
  minHeight = '120px'
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[inherit]',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Keep editor up-to-date with external value changes (e.g. form reset, initial load)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="h-[120px] w-full border rounded-md bg-muted/20 animate-pulse"></div>;
  }

  const insertVariable = (variableValue: string) => {
    // Inject {{ variable_name }}
    editor.chain().focus().insertContent(`{{${variableValue}}}`).run();
  };

  return (
    <div className={cn("flex flex-col border border-input rounded-md overflow-hidden bg-background focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-colors", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-1 border-b bg-muted/40">
        <Toggle
          size="sm"
          pressed={editor.isActive('bold')}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          aria-label="Toggle bold"
          className="h-8 w-8 p-0"
        >
          <Bold className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('italic')}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Toggle italic"
          className="h-8 w-8 p-0"
        >
          <Italic className="h-4 w-4" />
        </Toggle>

        <div className="w-px h-4 bg-border mx-1" />

        <Toggle
          size="sm"
          pressed={editor.isActive('bulletList')}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Toggle bullet list"
          className="h-8 w-8 p-0"
        >
          <List className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('orderedList')}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Toggle ordered list"
          className="h-8 w-8 p-0"
        >
          <ListOrdered className="h-4 w-4" />
        </Toggle>

        {variables && variables.length > 0 && (
          <>
            <div className="flex-1" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium border-dashed">
                  <Braces className="h-3.5 w-3.5" />
                  <span>Variáveis</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuLabel className="text-xs">Inserir no texto</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {variables.map((v) => (
                  <DropdownMenuItem 
                    key={v.value} 
                    onClick={() => insertVariable(v.value)}
                    className="flex flex-col items-start gap-0.5 cursor-pointer py-2"
                  >
                    <span className="text-sm font-medium">{v.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 py-0.5 rounded">
                      {`{{${v.value}}}`}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {/* Editor Content */}
      <div 
        className="flex-1 overflow-y-auto p-3 text-sm" 
        style={{ minHeight: minHeight }}
        onClick={() => {
           // focus editor if user clicks empty area below text
           if (editor && !editor.isFocused) {
              editor.commands.focus();
           }
        }}
      >
        <EditorContent editor={editor} className="outline-none h-full" />
      </div>
    </div>
  );
}
