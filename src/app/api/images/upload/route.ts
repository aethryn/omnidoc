import { PrismaClient } from '@/generated/prisma';
import { v2 as cloudinary } from 'cloudinary';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserIdFromRequest, createAuthErrorResponse, verifyDocumentAccess } from '@/lib/auth';

const prisma = new PrismaClient();

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
];

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication check
    const authResult = getCurrentUserIdFromRequest(request);
    if (!authResult.userId) {
      return createAuthErrorResponse(authResult);
    }
    const userId = authResult.userId;

    // 2. Extract form data
    const formData = await request.formData();
    const file = formData.get('file');
    const documentId = formData.get('documentId');

    // 3. Validate inputs
    if (!documentId || typeof documentId !== 'string' || documentId.trim() === '') {
      return NextResponse.json(
        { error: 'Valid documentId is required' },
        { status: 400 }
      );
    }

    if (!file || typeof file === 'string' || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'A valid image file is required' },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: 'File is empty' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds the maximum allowed limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed formats: JPEG, PNG, GIF, WebP, SVG' },
        { status: 400 }
      );
    }

    // 4. Authorization check: Verify user owns document or is an accepted editor/admin collaborator
    const { authorized } = await verifyDocumentAccess(prisma, documentId, userId, ['admin', 'editor']);
    if (!authorized) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    // 5. Configure Cloudinary
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary environment variables are missing');
      return NextResponse.json(
        { error: 'Image storage service is not configured' },
        { status: 500 }
      );
    }

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // 6. Convert file to buffer and stream upload to Cloudinary
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadResponse = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'documents' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    }) as any;

    // 7. Save image record to database
    const fileName = (file as File).name || 'uploaded_image';
    const imageRecord = await prisma.documentImage.create({
      data: {
        documentId: documentId,
        fileName: uploadResponse.public_id || `img_${Date.now()}`,
        originalName: fileName,
        fileUrl: uploadResponse.secure_url,
        fileSize: uploadResponse.bytes || file.size,
        width: uploadResponse.width || null,
        height: uploadResponse.height || null,
        mimeType: uploadResponse.format ? `image/${uploadResponse.format}` : file.type,
      },
    });

    return NextResponse.json(imageRecord, { status: 201 });
  } catch (error) {
    console.error('Error uploading image: ', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}