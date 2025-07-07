// Alternative API route for floor plan uploads
// Create this file: app/api/floor-plans/route.ts

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Check authentication
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;
    const geometry = JSON.parse(formData.get('geometry') as string);
    const properties = JSON.parse(formData.get('properties') as string);

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload file to storage
    const fileName = `floor-plans/${Date.now()}-${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, file);

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    // Insert into database using server-side client (bypasses RLS)
    const floorPlanId = crypto.randomUUID();
    const { error: dbError } = await supabase
      .from('features')
      .insert({
        id: floorPlanId,
        type: 'floor-plan',
        geometry,
        properties: {
          ...properties,
          image_url: urlData.publicUrl,
          created_by: session.user.id
        },
        for: 'floor-plan'
      });

    if (dbError) {
      // Clean up uploaded file on error
      await supabase.storage
        .from('images')
        .remove([fileName]);
      
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      id: floorPlanId,
      imageUrl: urlData.publicUrl 
    });

  } catch (error) {
    console.error('Floor plan upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
