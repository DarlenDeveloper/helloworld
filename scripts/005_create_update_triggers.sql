-- Create updated_at triggers for tables that need them

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contact_batches_updated_at BEFORE UPDATE ON contact_batches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_knowledge_base_articles_updated_at BEFORE UPDATE ON knowledge_base_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update contact count in batches
CREATE OR REPLACE FUNCTION update_batch_contact_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE contact_batches 
        SET contact_count = contact_count + 1 
        WHERE id = NEW.batch_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE contact_batches 
        SET contact_count = contact_count - 1 
        WHERE id = OLD.batch_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Add trigger for batch contact count
CREATE TRIGGER update_batch_contact_count_trigger
    AFTER INSERT OR DELETE ON batch_contacts
    FOR EACH ROW EXECUTE FUNCTION update_batch_contact_count();

-- Function to update campaign statistics
CREATE OR REPLACE FUNCTION update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE campaigns 
        SET calls_made = calls_made + 1,
            success_rate = (
                SELECT ROUND(
                    (COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / COUNT(*)) * 100, 2
                )
                FROM call_history 
                WHERE campaign_id = NEW.campaign_id
            )
        WHERE id = NEW.campaign_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Add trigger for campaign statistics
CREATE TRIGGER update_campaign_stats_trigger
    AFTER INSERT ON call_history
    FOR EACH ROW EXECUTE FUNCTION update_campaign_stats();
