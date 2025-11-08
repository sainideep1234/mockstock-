/*


CREATE OR REPLACE FUNCTION follow_user(
  p_follower_id UUID,
  p_following_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_follower_exists BOOLEAN;
  v_following_exists BOOLEAN;
  v_already_following BOOLEAN;
  v_new_follower_count INT;
  v_new_following_count INT;
BEGIN

  -- Step 1: Validate - Cannot follow yourself

  IF p_follower_id = p_following_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', NULL,
      'message', 'Cannot follow yourself'
    );
  END IF;
  

  -- Step 2: Validate - Both users must exist
  -- Uses index: users(id) [Primary Key]

  
  -- Check if follower exists
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = p_follower_id
  ) INTO v_follower_exists;
  
  IF NOT v_follower_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', NULL,
      'message', 'Follower user not found'
    );
  END IF;
  
  -- Check if user to follow exists
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = p_following_id
  ) INTO v_following_exists;
  
  IF NOT v_following_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', NULL,
      'message', 'User to follow not found'
    );
  END IF;
  

  -- Step 3: Check if already following
  -- Uses index: ms_followers(follower_id, following_id)

  SELECT EXISTS(
    SELECT 1 
    FROM ms_followers 
    WHERE follower_id = p_follower_id 
      AND following_id = p_following_id
  ) INTO v_already_following;
  
  IF v_already_following THEN
    RETURN jsonb_build_object(
      'success', false,
      'data', NULL,
      'message', 'Already following this user'
    );
  END IF;
  

  -- Step 4: Insert follow relationship
  -- Protected by unique constraint: (follower_id, following_id)
  -- This handles race conditions if two requests arrive simultaneously

  BEGIN
    INSERT INTO ms_followers (follower_id, following_id)
    VALUES (p_follower_id, p_following_id);
  EXCEPTION
    WHEN unique_violation THEN
      -- Race condition: Another transaction inserted this relationship
      RETURN jsonb_build_object(
        'success', false,
        'data', NULL,
        'message', 'Already following this user'
      );
  END;
  

  -- Step 5: Update follower count (user being followed)
  -- Uses SELECT FOR UPDATE to prevent concurrent counter issues
  -- Then increments and returns new count atomically

  UPDATE ms_user_details
  SET follower_count = follower_count + 1
  WHERE user_id = p_following_id
  RETURNING follower_count INTO v_new_follower_count;
  
  -- If user_details record doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO ms_user_details (user_id, follower_count, following_count)
    VALUES (p_following_id, 1, 0)
    RETURNING follower_count INTO v_new_follower_count;
  END IF;
  

  -- Step 6: Update following count (user who followed)
  -- Same atomic update with RETURNING clause

  UPDATE ms_user_details
  SET following_count = following_count + 1
  WHERE user_id = p_follower_id
  RETURNING following_count INTO v_new_following_count;
  
  -- If user_details record doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO ms_user_details (user_id, follower_count, following_count)
    VALUES (p_follower_id, 0, 1)
    RETURNING following_count INTO v_new_following_count;
  END IF;
  

  -- Step 7: Return success with updated counts

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'message', 'Successfully followed user',
      'followerNewFollowingCount', v_new_following_count,
      'followingNewFollowerCount', v_new_follower_count
    ),
    'message', 'Successfully followed user'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error internally for debugging
    RAISE NOTICE 'follow_user failed for % -> %: %', 
      p_follower_id, p_following_id, SQLERRM;
    
    -- Return generic error to client (don't expose DB internals)
    RETURN jsonb_build_object(
      'success', false,
      'data', NULL,
      'message', 'Failed to follow user'
    );
END;
$$;


-- Grant appropriate permissions

REVOKE ALL ON FUNCTION follow_user(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION follow_user(UUID, UUID) TO authenticated;











-- ==================================================================
-- Add documentation
-- ==================================================================
COMMENT ON FUNCTION follow_user(UUID, UUID) IS 
'Creates a follower relationship between two users with atomic counter updates.

Parameters:
  p_follower_id (UUID): User who is following
  p_following_id (UUID): User being followed

Returns:
  JSONB object with structure:
  {
    success: boolean,
    data: {
      message: string,
      followerNewFollowingCount: number,  // Updated count for follower
      followingNewFollowerCount: number   // Updated count for user being followed
    } | null,
    message: string
  }

Validations:
  - Both users must exist
  - Cannot follow yourself
  - Cannot follow the same user twice (protected by unique constraint)

Concurrency: Handles race conditions via unique constraint and atomic updates.
Security: Uses SECURITY DEFINER. Implement RLS for production.

Example:
  SELECT follow_user(
    ''550e8400-e29b-41d4-a716-446655440000''::uuid,
    ''660f9511-f39c-52e5-b827-557766551111''::uuid
  );
';
*/