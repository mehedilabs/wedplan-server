
import type {} from "multer";

export const uploadImage = async (
  image: Express.Multer.File,
): Promise<string> => {
  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    throw new Error("ImgBB API key is not configured");
  }

  const formData = new FormData();

  const imageBlob = new Blob([new Uint8Array(image.buffer)], {
    type: image.mimetype,
  });

  formData.append("image", imageBlob, image.originalname);

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${apiKey}`,
    {
      method: "POST",
      body: formData,
    },
  );

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error("Image upload failed");
  }

  return result.data.url;
};
