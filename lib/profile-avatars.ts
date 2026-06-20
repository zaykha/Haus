export const profileAvatarOptions = [
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
] as const;

export function getProfileAvatarLabel(path: string) {
  const filename = path.split("/").pop() ?? path;
  const name = filename.replace(/\.[^.]+$/, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}
