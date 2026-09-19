'use client'

import { BubbleMenu, Editor } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import {
  Code,
  Paragraph as ParagraphIcon,
  Image as ImageIcon,
  TextHOneIcon,
  TextHTwoIcon,
  TextHThreeIcon,
  TextItalicIcon,
  TextBIcon,
  TextUnderlineIcon,
  TextStrikethroughIcon,
  HighlighterIcon,
  LinkSimpleIcon,
} from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { uploadAndInsertImage } from './image-upload'
import { normalizeHttpUrl } from '@/lib/links'

interface EditorBubbleMenuProps {
  editor: Editor
  documentId?: string
  ensureDocumentId?: () => Promise<string | null>
}

export function EditorBubbleMenu({ editor, documentId, ensureDocumentId }: EditorBubbleMenuProps) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([])
  const [isOpen, setIsOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if((e.ctrlKey || e.metaKey) && e.key === 'k'){
        e.preventDefault();//stop browser goonin mechanism
        setLinkUrl(editor.getAttributes('link').href || '')
        setIsOpen((prev) => !prev);
        // editor.view.updateState(editor.state);
        editor.view.focus();
      }

      //close on escape key
      if(e.key === 'Escape'){
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  const BubbleDivider = () => <div className="w-px h-6 bg-gray-300 mx-1" />

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({editor, view, state, from, to}) => {
        if (typeof window !== "undefined" && window.matchMedia("(max-width: 720px), (pointer: coarse)").matches) return false;
        //show if text is selected (default behavior) - needed.
        const hasSelection = !state.selection.empty;

        //show if CTRL+K was pressed (isOpen === true)
        return hasSelection || isOpen;
      }}
      tippyOptions={{
        duration: 0,
        placement: 'top',
        maxWidth: 'none',
        popperOptions: {
          modifiers: [
            {
              name: 'preventOverflow',
              options: {
                boundary: 'viewport',
                padding: 8,
              },
            },
            {
              name: 'flip',
              options: {
                fallbackPlacements: ['bottom', 'top-start', 'top-end', 'bottom-start', 'bottom-end'],
                padding: 8,
              },
            },
          ],
        },
      }}
      className="bg-white shadow-xl rounded-xl p-1.5 border border-gray-200 max-w-[95vw]"
    >
      <div className="flex items-center gap-0.5 flex-wrap max-w-full motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
        {/* Paragraph */}
        <button
          ref={(el) => { buttonsRef.current[0] = el }}
          onClick={() => editor.chain().focus().setParagraph().run()}
          title="Paragraph"
          className={`p-2 rounded-lg transition-colors ${
            !editor.isActive('heading') ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <ParagraphIcon size={18} weight="bold" />
        </button>

        {/* H1 */}
        <button
          ref={(el) => { buttonsRef.current[1] = el }}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
          className={`p-2 rounded-lg transition-colors ${
            editor.isActive('heading', { level: 1 }) ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <TextHOneIcon size={18} weight="bold" />
        </button>

        {/* H2 */}
        <button
          ref={(el) => { buttonsRef.current[2] = el }}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
          className={`p-2 rounded-lg transition-colors ${
            editor.isActive('heading', { level: 2 }) ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <TextHTwoIcon size={18} weight="bold" />
        </button>

        {/* H3 */}
        <button
          ref={(el) => { buttonsRef.current[3] = el }}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
          className={`p-2 rounded-lg transition-colors ${
            editor.isActive('heading', { level: 3 }) ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <TextHThreeIcon size={18} weight="bold" />
        </button>

        <BubbleDivider />

        {/* Bold */}
        <button
          ref={(el) => { buttonsRef.current[4] = el }}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
          className={`p-2 rounded-lg transition-colors ${
            editor.isActive('bold') ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <TextBIcon size={18} weight="bold" />
        </button>

        {/* Italic */}
        <button
          ref={(el) => { buttonsRef.current[5] = el }}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
          className={`p-2 rounded-lg transition-colors ${
            editor.isActive('italic') ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <TextItalicIcon size={18} weight="bold" />
        </button>

        {/* Underline */}
        <button
          ref={(el) => { buttonsRef.current[6] = el }}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
          className={`p-2 rounded-lg transition-colors ${
            editor.isActive('underline') ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <TextUnderlineIcon size={18} weight="bold" />
        </button>

        {/* Strikethrough */}
        <button
          ref={(el) => { buttonsRef.current[7] = el }}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
          className={`p-2 rounded-lg transition-colors ${
            editor.isActive('strike') ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <TextStrikethroughIcon size={18} weight="bold" />
        </button>

        <BubbleDivider />

        {/* Code */}
        <button
          ref={(el) => { buttonsRef.current[8] = el }}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Code"
          className={`p-2 rounded-lg transition-colors ${
            editor.isActive('code') ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Code size={18} weight="bold" />
        </button>

        {/* Highlight */}
        <button
          ref={(el) => { buttonsRef.current[9] = el }}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="Highlight"
          className={`p-2 rounded-lg transition-colors ${
            editor.isActive('highlight') ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <HighlighterIcon size={18} weight="bold" />
        </button>

        <BubbleDivider />

        {/* Link */}
        <button
          ref={(el) => { buttonsRef.current[10] = el }}
          onClick={() => {
            setLinkUrl(editor.getAttributes('link').href || '')
            setIsOpen(true)
            editor.view.focus()
          }}
          title="Link"
          className={`p-2 rounded-lg transition-colors ${
            editor.isActive('link') ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <LinkSimpleIcon size={18} weight="bold" />
        </button>
        {isOpen && <form className="link-editor-popover" onSubmit={(event) => { event.preventDefault(); const href = normalizeHttpUrl(linkUrl); if (!href) return; editor.chain().focus().setLink({ href }).run(); setIsOpen(false); }}><input autoFocus value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="Paste a link" aria-label="Link URL"/><button type="submit">Apply</button><button type="button" onClick={() => { const href=normalizeHttpUrl(linkUrl); if(href)void navigator.clipboard.writeText(href); }}>Copy</button>{editor.isActive('link') && <button type="button" onClick={() => { editor.chain().focus().unsetLink().run(); setIsOpen(false); }}>Remove</button>}</form>}

        {/* Image Upload */}
        <button
          ref={(el) => { buttonsRef.current[11] = el }}
          onClick={async () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif'
            
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (!file) return

              await uploadAndInsertImage(file, ensureDocumentId || (() => Promise.resolve(documentId || null)), (data) => {
                editor.chain().focus().setImage({ src: data.fileUrl, alt: data.originalName || "", width: 100, align: "center" } as never).run()
              })
            }

            input.click()
          }}
          title="Insert Image"
          className="p-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
        >
          <ImageIcon size={18} weight="bold" />
        </button>

      </div>
    </BubbleMenu>
  )
}
