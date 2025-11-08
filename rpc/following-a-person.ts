/*
-- The complete, production-ready RPC function
CREATE OR REPLACE FUNCTION follow_user(
  p_follower_id INT,
  p_following_id INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with elevated privileges
AS $$
DECLARE
  v_result JSON;
  v_already_following BOOLEAN;
BEGIN
  -- 1. Validate: Can't follow yourself
  IF p_follower_id = p_following_id THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Cannot follow yourself'
    );
  END IF;

  -- 2. Check if already following
  SELECT EXISTS(
    SELECT 1 FROM ms_followers 
    WHERE follower_id = p_follower_id 
    AND following_id = p_following_id
  ) INTO v_already_following;

  IF v_already_following THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Already following this user'
    );
  END IF;

  -- 3. Start transaction (automatic with function)
  -- Insert follow relationship
  INSERT INTO ms_followers (follower_id, following_id)
  VALUES (p_follower_id, p_following_id);

  -- 4. Update follower count (user being followed)
  UPDATE ms_user_details
  SET follower_count = follower_count + 1
  WHERE user_id = p_following_id;

  -- 5. Update following count (user who followed)
  UPDATE ms_user_details
  SET following_count = following_count + 1
  WHERE user_id = p_follower_id;

  -- 6. Return success
  RETURN json_build_object(
    'success', true,
    'message', 'following'
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Automatic rollback on any error
    RETURN json_build_object(
      'success', false,
      'message', SQLERRM  -- Error message
    );
END;
$$;

*/