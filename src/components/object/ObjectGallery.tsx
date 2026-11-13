import ObjectImage from "@/components/ObjectImage";
import { MAX_OBJECT_IMAGES, type ObjectImageInfo } from "@/lib/objects/detail";

/** The hero is as wide as the text column on desktop and full-width on a phone. */
const HERO_IMAGE_SIZES = "(max-width: 48rem) 100vw, 48rem";
/** Gallery thumbnails: two per row on a phone, about 12rem wide beyond. */
const GALLERY_IMAGE_SIZES = "(max-width: 40rem) 50vw, 12rem";

/**
 * Alt text for a photograph: the recorded alt text, else the recorded
 * caption, else the object's name and the image's position. The fallback
 * says only what is known - which object this is a picture of - and never
 * describes what the picture shows.
 */
export function imageAltText(image: ObjectImageInfo, objectName: string, position: number): string {
  return image.altTextLv ?? image.captionLv ?? `${objectName}, ${position}. attēls`;
}

/** Credit, attribution and licence name, in that order, as recorded. */
function creditParts(image: ObjectImageInfo): string[] {
  return [image.credit, image.attributionNote, image.licenseName].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
}

function ImageCredit({ image }: { image: ObjectImageInfo }) {
  const textParts = [image.credit, image.attributionNote].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  const hasLicense = image.licenseName !== null || image.licenseUrl !== null;
  if (textParts.length === 0 && !hasLicense) {
    return null;
  }
  return (
    <span className="objectImageCredit">
      {textParts.join(" · ")}
      {hasLicense ? (
        <>
          {textParts.length > 0 ? " · " : null}
          {image.licenseUrl ? (
            <a href={image.licenseUrl} rel="license noopener noreferrer">
              {image.licenseName ?? "Licence"}
            </a>
          ) : (
            image.licenseName
          )}
        </>
      ) : null}
    </span>
  );
}

/** The cover photograph at the top of an object page. Loaded eagerly: it is the largest thing on screen. */
export function ObjectHeroImage({
  image,
  objectName,
}: {
  image: ObjectImageInfo;
  objectName: string;
}) {
  return (
    <figure className="objectHero">
      <div className="objectImageFrame objectHeroFrame">
        <ObjectImage
          src={image.sourceUrl}
          alt={imageAltText(image, objectName, 1)}
          sizes={HERO_IMAGE_SIZES}
          eager
        />
      </div>
      <figcaption>
        {image.captionLv ? <span className="objectImageCaption">{image.captionLv}</span> : null}
        <ImageCredit image={image} />
        {/* The picture's own link (the workbook's column G URL), always
            shown, so the original can be opened whether or not it loads. */}
        <a
          className="objectImageSourceLink"
          href={image.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Atvērt oriģinālo attēlu (jaunā cilnē)"
        >
          Atvērt oriģinālo attēlu
        </a>
      </figcaption>
    </figure>
  );
}

/**
 * The remaining photographs. Each thumbnail links to the full-size
 * original; the credits recorded for these images are printed once below
 * the grid rather than repeated under every thumbnail.
 */
export function ObjectGallery({
  images,
  objectName,
  hasMore,
}: {
  /** Images after the hero. */
  images: ObjectImageInfo[];
  objectName: string;
  hasMore: boolean;
}) {
  if (images.length === 0) {
    return null;
  }

  const creditLines = [...new Set(images.map((image) => creditParts(image).join(" · ")))].filter(
    (line) => line.length > 0,
  );

  return (
    <section className="objectSection" aria-labelledby="object-gallery">
      <h2 id="object-gallery">Attēli</h2>
      <ul className="objectGallery">
        {images.map((image, index) => (
          <li key={image.id}>
            <figure>
              <a
                className="objectImageFrame objectGalleryFrame"
                href={image.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ObjectImage
                  src={image.sourceUrl}
                  // +2: the hero is image 1.
                  alt={imageAltText(image, objectName, index + 2)}
                  sizes={GALLERY_IMAGE_SIZES}
                  insideLink
                />
                <span className="visuallyHidden"> (atvērt pilnā izmērā jaunā cilnē)</span>
              </a>
              {image.captionLv ? <figcaption>{image.captionLv}</figcaption> : null}
            </figure>
          </li>
        ))}
      </ul>
      {creditLines.length > 0 ? (
        <p className="objectSectionNote">
          {creditLines.length === 1 ? "Attēlu avots: " : "Attēlu avoti: "}
          {creditLines.join("; ")}
        </p>
      ) : null}
      {hasMore ? (
        <p className="objectSectionNote">Rādīti pirmie {MAX_OBJECT_IMAGES} attēli.</p>
      ) : null}
    </section>
  );
}
