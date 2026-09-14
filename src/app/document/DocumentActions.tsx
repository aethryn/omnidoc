"use client";

import { useState, useRef } from "react";
import {
  DotsThreeCircleIcon,
  FilePdfIcon,
  FloppyDiskBackIcon,
  PencilIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { GSAPDropdownMenu } from "@/components/dropdown-menu";
import gsap from "gsap";
import { Modal } from "@/components/modal";
import { SpotlightButton } from "@/components/ui/spotlight-button";

interface DocumentActionsProps {
  onSave: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  showDelete?: boolean;
  documentTitle: string;
  onExportPdf: () => void;
  onExportHtml?: () => void;
}

export function DocumentActions({
  onSave,
  onRename,
  onDelete,
  showDelete = true,
  documentTitle,
  onExportPdf,
  onExportHtml,
}: DocumentActionsProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const menuIconRef = useRef<HTMLDivElement>(null);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [currentTitle, setCurrentTitle] = useState<string>("");

  // Toggle dropdown and animate icon
  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);

    if (menuIconRef.current) {
      gsap.to(menuIconRef.current, {
        rotation: isDropdownOpen ? 0 : 90,
        duration: 0.3,
        ease: "power2.out",
      });
    }
  };

  // Handle rename with prompt.
  const handleRename = () => {
    setIsRenameModalOpen(true);
    setIsDropdownOpen(false); //close
  };

  // Handle delete with confirmation
  const handleDelete = () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this document?"
    );
    if (confirmed) {
      onDelete();
    }
  };

  const handleExportPdf = () => {
    //open print dialog
    window.print();
  }

  const dropdownItems = [
    // {
    //   label: "Save",
    //   icon: <FloppyDiskBackIcon size={20} />,
    //   onClick: onSave,
    // },
    {
      label: "Export to PDF",
      icon: <FilePdfIcon size={20} />,
      onClick: handleExportPdf,
    },
    ...(onExportHtml ? [{ label: "Export to HTML", icon: <FilePdfIcon size={20} />, onClick: onExportHtml }] : []),
    {
      label: "Rename",
      icon: <PencilIcon size={20} />,
      onClick: handleRename,
    },
    ...(showDelete
      ? [
          {
            label: "Delete",
            icon: <TrashIcon size={20} />,
            onClick: handleDelete,
            variant: "danger" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="relative">
      <div
        ref={menuIconRef}
        onClick={toggleDropdown}
        className="cursor-pointer"
      >
        <DotsThreeCircleIcon
          size={30}
          className="text-gray-700 hover:text-blue-500 transition-colors"
        />
      </div>
      <GSAPDropdownMenu
        isOpen={isDropdownOpen}
        onClose={() => {
          setIsDropdownOpen(false);
          if (menuIconRef.current) {
            gsap.to(menuIconRef.current, {
              rotation: 0,
              duration: 0.3,
              ease: "power2.out",
            });
          }
        }}
        items={dropdownItems}
      />
      <Modal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        title="Rename Document"
      >
        <input
          type="text"
          defaultValue={documentTitle}
          className="w-full border text-gray-700 p-2 rounded mb-4"
          id="renameInput"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setIsRenameModalOpen(false)}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <SpotlightButton
            onClick={() => {
              const newTitle = (
                document.getElementById("renameInput") as HTMLInputElement
              ).value;
              if (newTitle && newTitle !== documentTitle) {
                onRename(newTitle);
                setIsRenameModalOpen(false);
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
    </div>
  );
}
