import supabase from "../utils/supabase.js";

async function updateUserProfile(
  userId: number, 
  updates: {
    name?: string;
    city?: string;
    location?: string;
    company?: string;
    age?: number;
  }
) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single(); // Get single row back

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

// Usage
await updateUserProfile(123, {
  name: 'Rahul Sharma',
  city: 'Delhi',
  company: 'TCS',
  age: 28
});