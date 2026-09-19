"use client";

import React, { useEffect, useRef, useState } from 'react';
import { DotsThreeVerticalIcon, PencilSimpleIcon, TrashIcon, TextTIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { GSAPDropdownMenu } from '@/components/dropdown-menu';
import { Modal } from '@/components/modal';
import { SpotlightButton } from '@/components/ui/spotlight-button';
import axios from 'axios';

interface Collaborator {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface Document {
  id: string;
  title: string;
  content: string;
  description?: string;
  updatedAt: string;
  collaborators: Collaborator[];
}

interface DocumentListProps {
  documents: Document[];
  isLoading: boolean;
  onRefresh?: () => void;
}

export default function DocumentList({ documents, isLoading, onRefresh }: DocumentListProps) {
  const router = useRouter();
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{id: string, title: string} | null>(null);

  const handleDocumentClick = (documentId: string) => {
    router.push(`/document/${documentId}`);
  };

  const handleRename = async(documentId: string, currentTitle: string) => {

    setSelectedDoc({ id: documentId, title: currentTitle });

    setIsRenameModalOpen(true);
    setOpenDropdownIndex(null);

  }

  const handleEdit = (documentId: string) => {
    router.push(`/document/${documentId}`);
    setOpenDropdownIndex(null);
  };

  const handleDelete = async (documentId: string, title: string) => {

    setSelectedDoc({ id: documentId, title: title });
    setIsDeleteModalOpen(true);
    setOpenDropdownIndex(null);
    

  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getCollaboratorColors = () => [
    'bg-red-500',
    'bg-blue-500', 
    'bg-yellow-500',
    'bg-green-500',
    'bg-purple-500'
  ];

  const uniqueDocuments = documents.filter((document, index, items) => items.findIndex((item) => item.id === document.id) === index);

  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdownIndex !== null) {
        const target = event.target as HTMLElement;
        if (!target.closest('.relative')) {
          setOpenDropdownIndex(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdownIndex]);

  // Hover animation for each title
  const handleDocumentHover = (index: number, isEntering: boolean) => {
    const title = titleRefs.current[index];
    if (!title) return;

    if (isEntering) {
      gsap.to(title, {
        x: 10,
        color: '#3b82f6', //blue-500
        duration: 0.3,
        ease: 'power2.out'
      });
    } else {
      gsap.to(title, {
        x: 0,
        color: '#1f2937', //gray-800
        duration: 0.3,
        ease: 'power2.out'
      });
    }
  };
  
  useEffect(() => {
    if(!isLoading && documents.length > 0){

      //get all document title elements
      const titles = document.querySelectorAll('[data-document-title]');

      gsap.fromTo(
        titles, 
        {
          opacity: 0,
          x: -20,
          scale: 0.95,
        }, {
          opacity: 1,
          x: 0,
          scale: 1,
          duration : 0.4,
          stagger: 0.08,
          ease: 'back.out(1.2)'
        }
      )
    }
  }, [isLoading, documents.length]);


  
  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex items-center tracking-tight justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-200"></div>
        </div>
      ) : uniqueDocuments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No documents yet. Create your first document!</p>
        </div>
      ) : (
        uniqueDocuments.slice(0, 4).map((doc, index) => (
          <div 
            key={doc.id}
            onClick={() => handleDocumentClick(doc.id)}
            className="flex items-center justify-between mx-5 cursor-pointer"
          >
            <div className="flex-1">
              <h3 
                ref={(el) => { titleRefs.current[index] = el }}
                data-document-title 
                onMouseEnter={() => handleDocumentHover(index, true)}
                onMouseLeave={() => handleDocumentHover(index, false)}
                className="font-extralight cursor-pointer text-gray-800 text-lg"
              >
                {doc.title || "Untitled Document"}
              </h3>
            </div>

            {/* Collaborators */}
            <div className="flex items-center gap-3">
              {doc.collaborators && doc.collaborators.length > 0 && (
                <div className="flex -space-x-2">
                  {doc.collaborators.slice(0, 3).map((collaborator, collabIndex) => (
                    <div
                      key={collaborator.id}
                      className={`w-8 h-8 rounded-full ${getCollaboratorColors()[collabIndex % getCollaboratorColors().length]} flex items-center justify-center text-white text-xs font-semibold`}
                      title={collaborator.user.name}
                    >
                      {getInitials(collaborator.user.name)}
                    </div>
                  ))}
                </div>
              )}

              {/* Document Options */}
              <div className='relative'>
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdownIndex(openDropdownIndex === index ? null : index);
                  }}
                  onMouseEnter={(e) => e.stopPropagation()}
                  onMouseLeave={(e) => e.stopPropagation()}
                  className='cursor-pointer hover:scale-110 hover:bg-slate-300 rounded-full transition-all duration-300 p-1'
                >
                  <DotsThreeVerticalIcon className='w-6 h-6 !text-gray-900' />
                </div>

                <div onClick={(e) => e.stopPropagation()}>
                  <GSAPDropdownMenu
                    isOpen={openDropdownIndex === index}
                    onClose={() => setOpenDropdownIndex(null)}
                    items={[
                    {
                      label: 'Rename',
                      icon: <TextTIcon weight="duotone" />,
                      onClick: () => handleRename(doc.id, doc.title)
                    },
                    {
                      label: 'Edit',
                      icon: <PencilSimpleIcon weight="duotone" />,
                      onClick: () => handleEdit(doc.id)
                    },
                    {
                      label: 'Delete',
                      icon: <TrashIcon weight="duotone" />,
                      onClick: () => handleDelete(doc.id, doc.title),
                      variant: 'danger'
                    }
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        ))
      )}
      {/* Modals */}
      <Modal 
        isOpen={isRenameModalOpen} 
        onClose={() => setIsRenameModalOpen(false)}
        title="Rename Document"
      >
        <input 
          type="text"
          defaultValue={""}
          placeholder={selectedDoc?.title}
          className="w-full border text-gray-700 p-2 rounded mb-4"
          id="newTitle"
        />
        <div className="flex justify-end gap-2">
          <SpotlightButton 
            onClick={async () => {
              const newTitle = (document.getElementById('newTitle') as HTMLInputElement).value;
              if (!newTitle || !selectedDoc) return;
              
              try {
                await axios.put(`/api/documents/${selectedDoc.id}`, 
                  { title: newTitle },
                  { withCredentials: true }
                );
                onRefresh?.();
                setIsRenameModalOpen(false);
              } catch (error) {
                console.error('Error renaming document:', error);
                alert('Failed to rename document');
              }
            }}
            innerColor="rgb(200,220,255)"
            outerColor="rgb(100,150,255)"
            hoverInnerColor="rgb(180,200,255)"
            hoverOuterColor="rgb(80,130,255)"
            className="text-sm"
          >
            Rename
          </SpotlightButton>
        </div>
      </Modal>

      <Modal 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Document"
      >
        <p className="mb-4 text-gray-700">Are you sure you want to delete "{selectedDoc?.title}"?</p>
        <div className="flex justify-end gap-2">
          <SpotlightButton 
            onClick={async () => {
              if (!selectedDoc) return;
              try {
                await axios.delete(`/api/documents/${selectedDoc.id}`, 
                  { withCredentials: true }
                );
                onRefresh?.();
                setIsDeleteModalOpen(false);
              } catch (error) {
                console.error('Error deleting document:', error);
                alert('Failed to delete document');
              }
            }}
            innerColor="rgb(255,200,200)"
            outerColor="rgb(255,100,100)"
            hoverInnerColor="rgb(255,180,180)"
            hoverOuterColor="rgb(255,80,80)"
            className="text-sm"
          >
            Delete
          </SpotlightButton>
        </div>
      </Modal>
    </div>
  );
}
