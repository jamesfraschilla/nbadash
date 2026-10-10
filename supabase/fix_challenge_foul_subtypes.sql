-- A foul's floor coordinates describe where it occurred, not whether it was a
-- shooting foul. Repair challenge rows that were labeled 3-Pt solely because a
-- matched personal, offensive, loose-ball, or other non-shooting foul occurred
-- beyond the arc.

with classified as (
  select
    challenges.id,
    public.nba_normalized_official_call_category(
      calls.primary_category,
      calls.secondary_category,
      calls.descriptor,
      calls.sub_type,
      calls.area,
      calls.area_detail
    ) as call_category
  from public.nba_coach_challenge_events challenges
  join public.nba_official_call_events calls
    on calls.id = challenges.matched_call_event_id
  where challenges.challenge_sub_type = '3-Pt'
)
update public.nba_coach_challenge_events challenges
set challenge_sub_type = case classified.call_category
  when 'Restricted Area Shooting Foul' then 'Restricted Area'
  when '3-Pt Shooting Foul' then '3-Pt'
  else classified.call_category
end
from classified
where challenges.id = classified.id
  and classified.call_category <> '3-Pt Shooting Foul';
