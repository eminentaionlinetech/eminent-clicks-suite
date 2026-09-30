
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_tool(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tool(uuid, text) TO authenticated;

-- Receipts: owner uploads into own folder; owner or admin can view. No edits/deletes.
CREATE POLICY "receipts owner upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "receipts owner or admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));

-- Job photos: owner with JobFlow access
CREATE POLICY "job photos owner" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'job-photos' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_tool(auth.uid(),'jobflow'))
  WITH CHECK (bucket_id = 'job-photos' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_tool(auth.uid(),'jobflow'));

-- Claim documents: owner with ClaimDesk access
CREATE POLICY "claim docs owner" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'claim-docs' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_tool(auth.uid(),'claimdesk'))
  WITH CHECK (bucket_id = 'claim-docs' AND (storage.foldername(name))[1] = auth.uid()::text AND public.has_tool(auth.uid(),'claimdesk'));
