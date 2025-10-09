"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Phone, Users } from "lucide-react"

interface Message {
  role: string
  content: string
}

interface VapiChat {
  id: string
  orgId: string
  previousChatId?: string
  input: Array<{ role: string; content: string }>
  output: Array<{ role: string; content: string }>
  assistantId: string
  messages: Array<{ role: string; content: string }>
  stream: boolean
  createdAt: string
  updatedAt: string
  cost: number
  costs: Array<any>
}

interface ChatDetailModalProps {
  chat: VapiChat | null
  isOpen: boolean
  onClose: () => void
}

export function ChatDetailModal({ chat, isOpen, onClose }: ChatDetailModalProps) {
  if (!chat) return null

  // Combine all messages in chronological order
  const allMessages: Message[] = [
    ...chat.messages.map(msg => ({ role: msg.role, content: msg.content })),
    ...chat.input.map(msg => ({ role: msg.role, content: msg.content })),
    ...chat.output.map(msg => ({ role: msg.role, content: msg.content }))
  ]

  // Remove duplicates and sort by appearance
  const uniqueMessages = allMessages.filter((msg, index, arr) => 
    arr.findIndex(m => m.content === msg.content && m.role === msg.role) === index
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold">Chat Conversation</DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                Chat ID: {chat.id.substring(0, 12)}... • {new Date(chat.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                {chat.messages.length + chat.input.length + chat.output.length} messages
              </Badge>
              <Badge variant="outline" className={chat.stream ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-700 border-gray-200"}>
                {chat.stream ? "Stream" : "Static"}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 p-6 max-h-96 overflow-y-auto">
          <div className="space-y-4">
            {uniqueMessages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No messages in this conversation
              </div>
            ) : (
              uniqueMessages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${
                    message.role === 'assistant' ? 'justify-start' : 'justify-end'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 bg-blue-100 border border-blue-200 rounded-full flex items-center justify-center">
                      <Phone className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-3 ${
                      message.role === 'assistant'
                        ? 'bg-gray-100 text-gray-900'
                        : 'bg-blue-500 text-white'
                    }`}
                  >
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </div>
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 bg-blue-500 border border-blue-600 rounded-full flex items-center justify-center">
                      <Users className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
