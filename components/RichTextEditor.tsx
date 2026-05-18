'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useCallback } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ value, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
    ],
    content: value,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  // Sync external value when not focused
  useEffect(() => {
    if (editor && !editor.isFocused && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('URL', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  const btn = (
    active: boolean,
    onClick: () => void,
    label: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 8px',
        border: '1px solid #d1d5db',
        borderRadius: 4,
        background: active ? '#0054A6' : '#fff',
        color: active ? '#fff' : '#374151',
        fontSize: '0.8rem',
        fontWeight: 600,
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '6px 8px',
          borderBottom: '1px solid #d1d5db',
          background: '#f9fafb',
          flexWrap: 'wrap',
        }}
      >
        {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'B')}
        {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'I')}
        {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), '• List')}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), '1. List')}
        {btn(editor.isActive('link'), setLink, 'Link')}
      </div>

      {/* Editor */}
      <div
        style={{ padding: '8px 12px', minHeight: 150 }}
        className="rich-text-editor-content"
      >
        <EditorContent editor={editor} />
      </div>

      {/* Minimal styling for prose-like output */}
      <style>{`
        .rich-text-editor-content .tiptap {
          outline: none;
          font-size: 0.9rem;
          line-height: 1.6;
          color: #1f2937;
        }
        .rich-text-editor-content .tiptap p {
          margin: 0 0 0.5em;
        }
        .rich-text-editor-content .tiptap ul,
        .rich-text-editor-content .tiptap ol {
          padding-left: 1.5em;
          margin: 0 0 0.5em;
        }
        .rich-text-editor-content .tiptap a {
          color: #0054A6;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
