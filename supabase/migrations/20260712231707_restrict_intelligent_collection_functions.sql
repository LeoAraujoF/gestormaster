REVOKE ALL ON FUNCTION public.claim_collection_dispatch(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.initialize_intelligent_collections(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_collection_score(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_collection_score_after_client_status_change() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_collection_dispatch(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_intelligent_collections(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_collection_score(uuid) TO service_role;
