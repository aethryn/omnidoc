import { prisma } from "@/lib/prisma";
import { activeCollaboratorConstraint, documentAccessWhere, getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { deriveDocumentPreview } from "@/lib/document-content";
import { allocateDocumentVersionNumber, documentContentHash } from "@/lib/document-version";
import { hasRealtimeCollaboration } from "@/lib/collaboration-eligibility";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    console.log("Params documentId: ", documentId);

    const authResult = await getCurrentUserIdFromRequest(request);
    
    if (!authResult.userId) {
      return createAuthErrorResponse(authResult);
    }
    
    const userId = authResult.userId;
    console.log("User ID: ", userId);
    console.log("Document ID: ", documentId);

    //check if the document exists and the usr has access to it.
    const document = await prisma.document.findFirst({
      where: { id: documentId, ...documentAccessWhere(userId) },
      include: {
        images: true,
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        versions: {
          orderBy: {
            versionNumber: "desc",
          },
          take: 10, //atleast 10 last versions
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found or access denied" },
        { status: 404 }
      );
    }

    const role = document.userId === userId ? "owner" : document.collaborators.find((member: typeof document.collaborators[number]) => member.userId === userId)?.role || "viewer";
    return NextResponse.json({
      ...document,
      role,
      yjsState: (document as any).yjsState ? Buffer.from((document as any).yjsState).toString("base64") : null,
    });
  } catch (error) {
    console.error("Error fetching document: ", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

//update a document
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getCurrentUserIdFromRequest(request);
    
    if (!authResult.userId) {
      return createAuthErrorResponse(authResult);
    }
    
    const userId = authResult.userId;
    const {id: documentId} = await params;
    const updateData = await request.json();

    //check if the user has permission to edit

    const document = await prisma.document.findFirst({
      where: { id: documentId, ...documentAccessWhere(userId, ["admin", "editor"]) },
      include: {
        shares: { where:{isActive:true,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}, select:{id:true}, take:1 },
        collaborators: { where:activeCollaboratorConstraint(), select:{id:true}, take:1 },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found or Permission denied" },
        { status: 404 }
      );
    }

    const collaborationEligible = hasRealtimeCollaboration(document);
    if (typeof updateData.content === "string" && collaborationEligible) {
      return NextResponse.json({ error: "Collaborative documents must be updated through the editor connection", code: "COLLABORATIVE_WRITE_REQUIRED" }, { status: 409 });
    }

    const contentChanged = typeof updateData.content === "string" && updateData.content !== document.content;
    const contentUpdate = typeof updateData.content === "string" ? updateData.content : null;
    const updatedDocument = await prisma.$transaction(async (tx) => {
      if (contentChanged && contentUpdate !== null) {
        await tx.documentVersion.create({
          data:{ documentId, title:document.title, content:document.content, versionNumber:await allocateDocumentVersionNumber(tx, documentId), source:"legacy-rest", contentHash:documentContentHash(document.title, document.content), contributors:[userId], createdBy:userId },
        });
        const updated = await tx.document.updateMany({
          where:{ id:documentId, yjsEpoch:document.yjsEpoch },
          data:{ content:contentUpdate, yjsState:null, yjsEpoch:{ increment:1 }, ...deriveDocumentPreview(contentUpdate), lastEditedAt:new Date(), updatedAt:new Date(), ...(typeof updateData.title === "string" ? { title:updateData.title.trim().slice(0, 200) || "Untitled document" } : {}) },
        });
        if (!updated.count) throw new Error("DOCUMENT_CHANGED");
      } else {
        await tx.document.update({ where:{ id:documentId }, data:{ ...(typeof updateData.title === "string" ? { title:updateData.title.trim().slice(0, 200) || "Untitled document" } : {}), updatedAt:new Date() } });
      }
      return tx.document.findUnique({
        where:{ id:documentId },
        include:{ images:true, collaborators:{ include:{ user:{ select:{ id:true, email:true, name:true } } } } },
      });
    });

    //log the update
    // console.log("Document updated: ", updatedDocument);

    await prisma.documentActivity.create({
      data: {
        documentId,
        userId,
        action: "edited",
        description: "Document content updated",
        metadata: {
          fieldsChanged: Object.keys(updateData),
          timestamp: new Date().toISOString(),
        },
      },
    });
    return NextResponse.json(updatedDocument);
  } catch (error) {
    if (error instanceof Error && error.message === "DOCUMENT_CHANGED") return NextResponse.json({ error:"The document became collaborative while saving. Retry in the live editor.", code:"COLLABORATIVE_WRITE_REQUIRED" }, { status:409 });
    console.error("Error updating document: ", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

//real-time patch for documents 
export async function PATCH(
    request: NextRequest,
    { params } : { params: Promise<{ id: string }> }
) {

    try {
        
        const authResult = await getCurrentUserIdFromRequest(request);
        
        if (!authResult.userId) {
            return createAuthErrorResponse(authResult);
        }
        
        const userId = authResult.userId;
        const { id: documentId } = await params;
        const updateData = await request.json();
        const contentUpdate = typeof updateData.content === "string" ? updateData.content : null;

        if (!contentUpdate) {
            return NextResponse.json({ error: "Document content is required" }, { status: 400 });
        }

        //permission check
        const document = await prisma.document.findFirst({
            where: { id: documentId, ...documentAccessWhere(userId, ["admin", "editor"]) }
        });

        if(!document){
            return NextResponse.json({
                error: "Document not found or Permission denied",
            }, { 
                status: 404
            })
        }

        //update only content and lastEditedAt for real-time updates
        const updatedDocument = await prisma.document.update({
            where: {
                id: documentId,
            },
            data: {
                content: contentUpdate,
                ...deriveDocumentPreview(contentUpdate),
                lastEditedAt: new Date(),
            },
        });

        return NextResponse.json(updatedDocument);

    } catch (error) {
        console.error(`Error updating document: ${error}`);
        return NextResponse.json({
            error: "Internal server error",
            
        }, {
            status: 500
        })
    }
}
//Delete doc
//TODO: Document unlocking
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        
        const authResult = await getCurrentUserIdFromRequest(request);
        
        if (!authResult.userId) {
            return createAuthErrorResponse(authResult);
        }
        
        const userId = authResult.userId;
        const { id: documentId } = await params;

        //check if the usr has permission to delete doc
        const document = await prisma.document.findFirst({
            where: {
                id: documentId,
                userId,
            },
            select: { id:true, images:{select:{fileName:true}} }
        });

        if(!document){
            return NextResponse.json({
                error: "Document not found or Permission denied"
            }, {
                status: 404
            })
        }

        if (document.images.length) {
          const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
          const { error: storageError } = await supabase.storage.from("document-images").remove(document.images.map((image: typeof document.images[number]) => image.fileName));
          if (storageError) console.error("Failed to remove document images", storageError.message);
        }

        //delete the document
        await prisma.document.delete({
            where: {
                id: documentId,
            }
        });

        return NextResponse.json({
            message: "Document deleted successfully"
        }, {
            status: 200
        })
    } catch (error) {
        console.error("Error deleting document: ", error);
        return NextResponse.json({
            error: "Internal server error",
        }, {
            status: 500
        })
    }
}
