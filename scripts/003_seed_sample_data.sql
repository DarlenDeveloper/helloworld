-- Insert sample contact batches (will only work after user authentication)
-- This is just sample structure - actual data will be inserted after login

-- Sample campaigns structure
-- INSERT INTO public.campaigns (user_id, name, description, status, target_contacts, completed_calls, success_rate)
-- VALUES 
--   (auth.uid(), 'Q4 Sales Outreach', 'End of year sales campaign targeting enterprise clients', 'active', 250, 180, 72.00),
--   (auth.uid(), 'Product Demo Follow-up', 'Following up with prospects who attended product demos', 'active', 120, 95, 79.17);

-- Sample contact batches structure  
-- INSERT INTO public.contact_batches (user_id, name, description, contact_count)
-- VALUES
--   (auth.uid(), 'Enterprise Prospects', 'Large enterprise companies for Q4 outreach', 150),
--   (auth.uid(), 'Demo Attendees', 'Contacts who attended recent product demos', 85);
