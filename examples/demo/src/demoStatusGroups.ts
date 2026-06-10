/**
 * Demo status → semantic-group mapping, fed to <StatusBadgeProvider> in
 * App.tsx and rendered as a reference table by BadgesDemo.tsx. Shared so the
 * showcase can never drift from what the provider actually maps.
 */
import type { SemanticGroup } from 'react-os-shell';

export const DEMO_STATUS_GROUPS: Record<string, SemanticGroup> = {
  // success — finished / confirmed states
  paid: 'success',
  approved: 'success',
  active: 'success',
  // active — currently moving
  in_production: 'active',
  in_transit: 'active',
  // queued — handed off, waiting to start
  submitted: 'queued',
  sent: 'queued',
  // info
  delivered: 'info',
  // pending — waiting / on hold
  pending: 'pending',
  at_port: 'pending',
  // warning — needs attention
  customs: 'warning',
  partially_paid: 'warning',
  // danger
  overdue: 'danger',
  // draft
  draft: 'draft',
  // neutral — terminal, no action
  cancelled: 'neutral',
  rejected: 'neutral',
};
