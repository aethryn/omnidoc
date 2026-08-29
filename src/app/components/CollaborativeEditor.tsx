'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useEffect, useState, useCallback, useMemo } from 'react'

interface CollaborativeEditorProps {
  documentId: string
  username?: string
}

export default function CollaborativeEditor({ 
  documentId, 
  username = `User-${Math.floor(Math.random() * 10000)}`
}: CollaborativeEditorProps) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  // Create Yjs doc and provider only once
  const ydoc = useMemo(() => new Y.Doc(), [])
  const wsProvider = useMemo(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
    return new WebsocketProvider('ws://localhost:4000', documentId, ydoc, {
      params: { token }
    })
  }, [documentId, ydoc])

  // Create editor after provider is ready
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      // Only add cursor extension after provider is ready
      ...(wsProvider ? [
        CollaborationCursor.configure({
          provider: wsProvider,
          user: {
            name: username,
            color: `#${Math.floor(Math.random() * 16777215).toString(16)}`
          }
        })
      ] : [])
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none'
      }
    }
  })

  // Handle WebSocket status
  useEffect(() => {
    const handleStatus = ({ status }: { status: any }) => {
      console.log('WebSocket status:', status)
      setStatus(status)
    }

    wsProvider.on('status', handleStatus)
    
    // Log when sync happens
    wsProvider.on('sync', (isSynced: boolean) => {
      console.log('Sync status:', isSynced)
    })

    return () => {
      wsProvider.off('status', handleStatus)
      wsProvider.destroy()
    }
  }, [wsProvider])

  // Update cursor information when provider changes
  useEffect(() => {
    if (editor && wsProvider) {
      editor.chain().focus().setContent('<p>Start typing...</p>').run()
    }
  }, [editor, wsProvider])

  const getStatusColor = useCallback(() => {
    switch (status) {
      case 'connected':
        return 'bg-green-500'
      case 'disconnected':
        return 'bg-red-500'
      default:
        return 'bg-yellow-500'
    }
  }, [status])

  if (!editor) {
    return <div>Loading editor...</div>
  }

  return (
    <div className="relative max-w-4xl mx-auto">
      <div className="absolute top-2 right-2 flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
        <span className="text-gray-600">
          {status} - {username}
        </span>
      </div>

      <div className="min-h-[500px] border rounded-lg shadow-sm bg-white p-8">
        <div className="prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto">
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="mt-2 text-sm text-gray-500 flex justify-between">
        <span>Document: {documentId}</span>
        <span>Connected as: {username}</span>
      </div>
    </div>
  )
}