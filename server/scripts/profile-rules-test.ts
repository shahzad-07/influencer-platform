import assert from "node:assert/strict";
import { isBrandProfileComplete } from "../src/modules/brands/brand-profile-rules";
import {
  isProfileImagePathForUser,
  isProfileImageType,
  PROFILE_IMAGE_MAX_BYTES,
} from "../src/modules/profiles/profile-image-storage";

const completeBrand = {
  companyName: "DealDoneHai Cafe",
  industry: "Restaurant",
  location: "Bengaluru",
  socialLinks: [{ url: "https://instagram.com/dealdonehai" }],
};

assert.equal(isBrandProfileComplete(completeBrand), true);
assert.equal(isBrandProfileComplete({ ...completeBrand, socialLinks: [] }), false);
assert.equal(isBrandProfileComplete({ ...completeBrand, companyName: " " }), false);
assert.equal(isBrandProfileComplete({ ...completeBrand, socialLinks: [{ url: " " }] }), false);
console.log("PASS brand offer requires name, industry, city and a social account");

assert.equal(isProfileImagePathForUser("brand/507f1f77bcf86cd799439011/a1b2.jpg", "brand", "507f1f77bcf86cd799439011"), true);
assert.equal(isProfileImagePathForUser("creator/507f1f77bcf86cd799439011/a1b2.png", "brand", "507f1f77bcf86cd799439011"), false);
assert.equal(isProfileImagePathForUser("brand/507f1f77bcf86cd799439012/a1b2.webp", "brand", "507f1f77bcf86cd799439011"), false);
assert.equal(isProfileImageType("image/jpeg"), true);
assert.equal(isProfileImageType("image/svg+xml"), false);
assert.equal(PROFILE_IMAGE_MAX_BYTES, 2 * 1024 * 1024);
console.log("PASS profile image role/path/type/size rules");
