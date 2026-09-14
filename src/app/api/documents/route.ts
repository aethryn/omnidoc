import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as Y from "yjs";
import { contentToYDoc } from "@/lib/document-yjs";

export async function GET(request: NextRequest){
    try {
        
        const authResult = await getCurrentUserIdFromRequest(request);
        
        if (!authResult.userId) {
            return createAuthErrorResponse(authResult);
        }
        
        const userId = authResult.userId;

        const documents = await prisma.document.findMany({
            where: {
                OR: [
                    { userId },
                    { collaborators: { some: { userId, acceptedAt: { not: null } } } },
                ],
            },
            orderBy: {
                updatedAt: "desc",
            },
            select: {
                id: true,
                title: true,
                updatedAt: true,
                lastEditedAt: true,
                userId: true,
                collaborators: { where: { acceptedAt: { not: null } }, select: { id: true, role: true, user: { select: { id: true, name: true, avatar: true } } } }
            }
        });

        return NextResponse.json(documents); 
    } catch (error) {
        console.error("Error fetching documents: ", error);
        return NextResponse.json({
            message: "Error fetching documents",
        }, {status: 500});
    }
}

//Create a new document
//TODO: Document locking
export async function POST(request: NextRequest){

    try {
        
        const authResult = await getCurrentUserIdFromRequest(request);
        
        if (!authResult.userId) {
            return createAuthErrorResponse(authResult);
        }
        
        const userId = authResult.userId;

        const { title = "Untitled", content = JSON.stringify({type:"doc",content:[{type:"paragraph"}]}), isPublic = false, tags = [] } = await request.json();

        const ydoc = contentToYDoc(content);
        const document = await prisma.document.create({
            data: {
                title,
                content,
                yjsState: Buffer.from(Y.encodeStateAsUpdate(ydoc)),
                userId,
                isPublic,
                tags
            },
            select: { id: true, title: true, updatedAt: true, lastEditedAt: true, yjsState:true }
        });

        return NextResponse.json({...document,yjsState:document.yjsState?Buffer.from(document.yjsState).toString("base64"):null});
    } catch (error) {
        console.error("Error creating document: ", error);
        return NextResponse.json({
            error: "Failed to create document",
        }, {status: 500});
    }
}
