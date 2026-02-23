-- Create inventory table
CREATE TABLE inventory (
  "itemId" TEXT PRIMARY KEY,
  "itemNumber" TEXT NOT NULL,
  timestamp TEXT,
  "createdBy" TEXT,
  status TEXT,
  shape TEXT,
  material TEXT,
  description TEXT,
  color TEXT,
  quantity TEXT,
  price TEXT,
  "weightKg" TEXT,
  "heightCm" TEXT,
  "widthCm" TEXT,
  "lengthCm" TEXT,
  expires TEXT,
  "mediaUrls" TEXT,
  "shortDescription" TEXT,
  "generatedDescription" TEXT,
  "detailedDescription" TEXT,
  "generatedImageUrls" TEXT,
  "generatedPngUrl" TEXT,
  "generatedSvgUrl" TEXT,
  "spatialBoxes2d" TEXT,
  "spatialPoints" TEXT,
  "spatialMasks" TEXT,
  "spatialBoxes3d" TEXT,
  "isClientVisible" BOOLEAN DEFAULT false,
  "printDate" TEXT,
  "payDate" TEXT,
  "payReq" TEXT,
  "sentDate" TEXT,
  "bookLanded" TEXT,
  "bookRetail" TEXT,
  "bookBardcode" TEXT,
  "bookAqCode" TEXT,
  "bookLandCode" TEXT,
  "crateId" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE inventory;

-- Create a function to update the updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to call the function on update
CREATE TRIGGER update_inventory_updated_at
BEFORE UPDATE ON inventory
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
