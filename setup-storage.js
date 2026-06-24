const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
dotenv.config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function setupStorage() {
  console.log('Creating mass_media bucket...')
  const { data, error } = await supabase.storage.createBucket('mass_media', {
    public: true,
    fileSizeLimit: 2097152, // 2MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
  })
  
  if (error) {
    if (error.message.includes('already exists') || error.error === 'Duplicate') {
       console.log('Bucket already exists, making it public just in case')
       await supabase.storage.updateBucket('mass_media', { public: true })
    } else {
       console.error('Error creating bucket:', error)
    }
  } else {
    console.log('Bucket created:', data)
  }
}

setupStorage()
