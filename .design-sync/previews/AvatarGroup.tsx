import { Avatar, AvatarGroup } from 'react-os-shell';

// AvatarGroup — overlaps avatars into a stack with a +N overflow chip.

export function Stacked() {
  return (
    <div className="p-5">
      <AvatarGroup max={4} size="md">
        <Avatar size="md" name="Alice Nguyen" />
        <Avatar size="md" name="Marco Reyes" />
        <Avatar size="md" name="Priya Patel" />
        <Avatar size="md" name="Tom Becker" />
        <Avatar size="md" name="Sara Lind" />
        <Avatar size="md" name="Yuki Tanaka" />
      </AvatarGroup>
    </div>
  );
}
