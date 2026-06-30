export type ProfileAvatarGroup = {
  id: string;
  label: string;
  options: string[];
};

export const profileAvatarGroups: ProfileAvatarGroup[] = [
  {
    id: "farm",
    label: "Farm Oriented",
    options: [
      "/farm-oriented-animals/bear.webp",
      "/farm-oriented-animals/cat.webp",
      "/farm-oriented-animals/chicken.webp",
      "/farm-oriented-animals/cow.webp",
      "/farm-oriented-animals/deer.webp",
      "/farm-oriented-animals/dog.webp",
      "/farm-oriented-animals/duck.webp",
      "/farm-oriented-animals/fox.webp",
      "/farm-oriented-animals/frog.webp",
      "/farm-oriented-animals/goat.webp",
      "/farm-oriented-animals/horse.webp",
      "/farm-oriented-animals/owl.webp",
      "/farm-oriented-animals/panda.webp",
      "/farm-oriented-animals/pig.webp",
      "/farm-oriented-animals/rabbit.webp",
      "/farm-oriented-animals/sheep.webp",
    ],
  },
  {
    id: "classic",
    label: "Animal Avatars",
    options: [
      "/animal_avatars/bear.webp",
      "/animal_avatars/cat.webp",
      "/animal_avatars/chicken.webp",
      "/animal_avatars/cow.webp",
      "/animal_avatars/deer.webp",
      "/animal_avatars/dog.webp",
      "/animal_avatars/elephant.webp",
      "/animal_avatars/fox.webp",
      "/animal_avatars/frog.webp",
      "/animal_avatars/giraffe.webp",
      "/animal_avatars/hamster.webp",
      "/animal_avatars/hedgehog.webp",
      "/animal_avatars/horse.webp",
      "/animal_avatars/kangaroo.webp",
      "/animal_avatars/koala.webp",
      "/animal_avatars/monkey.webp",
      "/animal_avatars/otter.webp",
      "/animal_avatars/owl.webp",
      "/animal_avatars/panda.webp",
      "/animal_avatars/parrot.webp",
      "/animal_avatars/penguin.webp",
      "/animal_avatars/pig.webp",
      "/animal_avatars/rabbit.webp",
      "/animal_avatars/raccoon.webp",
      "/animal_avatars/seal.webp",
      "/animal_avatars/sloth.webp",
      "/animal_avatars/squirrel.webp",
      "/animal_avatars/tiger.webp",
      "/animal_avatars/wolf.webp",
      "/animal_avatars/zebra.webp",
    ],
  },
];

export const profileAvatarOptions = profileAvatarGroups.flatMap((group) => group.options);

export const defaultProfileAvatarPath = profileAvatarGroups[0]?.options[0] ?? "";

export function getProfileAvatarLabel(path: string) {
  const filename = path.split("/").pop() ?? path;
  const name = filename.replace(/\.[^.]+$/, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function getProfileAvatarGroupId(path: string) {
  return profileAvatarGroups.find((group) => group.options.includes(path))?.id ?? profileAvatarGroups[0]?.id ?? "farm";
}
