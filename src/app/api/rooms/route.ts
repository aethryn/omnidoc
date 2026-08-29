import { PrismaClient } from "@/generated/prisma";
import { getCurrentUserIdFromRequest, createAuthErrorResponse, verifyDocumentAccess } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";


const prisma = new PrismaClient();

export async function POST(request: NextRequest){

    try {
        

        //Extract room name from request
        const { name, documentId } = await request.json();
        console.log('Received request with:', { name, documentId });
        
        const authResult = getCurrentUserIdFromRequest(request);
        
        if (!authResult.userId) {
            return createAuthErrorResponse(authResult);
        }
        
        const userId = authResult.userId;
        console.log('Authenticated userId:', userId);

        //validate and authorize document if provided
        if (documentId) {
            console.log('Validating document authorization:', documentId);
            const { authorized } = await verifyDocumentAccess(prisma, documentId, userId, ['admin', 'editor']);
            if (!authorized) {
                console.log('Document not found or access denied for user:', userId);
                return NextResponse.json(
                    { error: 'Document not found or access denied' },
                    { status: 404 }
                );
            }
        }

        //generate a random code for the room
        //
        let code;
        let isUnique = false;

        while(!isUnique){
            code = Math.random().toString(36).substring(2, 6).toUpperCase();
            const existingRoom = await prisma.room.findUnique({
                where: {
                    code
                }
            })

            //check if a room with this code already exists 
            if (!existingRoom){
                isUnique = true; //if unique then break.
            }
        }

        //now create the fucking room in the db
        const room = await prisma.room.create({
            data: {
                name,
                code,
                isActive: true,
                createdBy: {
                    connect: {
                        id:userId
                    }
                },
                //only connect document if provided
                ...(documentId && {
                    document: {
                        connect: {
                            id: documentId
                        }
                    }
                }),

                //add creator as host in RoomUser model
                participants: {
                    create: {
                        userId,
                        role: "host"
                    }
                }
            },

            //include related data in response
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,

                    }
                },
                document: true,
                participants: {
                    include: {
                        user: {
                            select: {
                                id:true,
                                name: true,
                                email: true,
                            }
                        }
                    }
                }
            }
        });

        return NextResponse.json(
            room,
            {
                status: 201
            }
        )

        
    } catch (error) {
        console.error('Error creating room:', error);
        return NextResponse.json(
            {
                error: 'Failed to create room'
            },
            {
                status: 500
            }
        )
    }finally{
        await prisma.$disconnect();
    }
}

