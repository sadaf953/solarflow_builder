export function percentCropRatio(width, height, rotation, ratio) {
    if (!width || !height || !ratio) return null;
    return (rotation % 180 ? 1 / ratio : ratio) * height / width;
}
export function fitCropRatio(crop, ratio) {
    if (!ratio) return crop;
    const width = Math.min(crop.width, 90, 90 * ratio);
    const height = width / ratio;
    return {x:(100-width)/2,y:(100-height)/2,width,height};
}
export function resizeCrop(crop, dx, dy, corner, ratio) {
    const right=crop.x+crop.width, bottom=crop.y+crop.height;
    let width=corner==='nw' ? crop.width-dx : crop.width+dx;
    let height=corner==='nw' ? crop.height-dy : crop.height+dy;
    const maxWidth=corner==='nw' ? right : 100-crop.x;
    const maxHeight=corner==='nw' ? bottom : 100-crop.y;
    width=Math.min(maxWidth,Math.max(15,width));
    height=Math.min(maxHeight,Math.max(15,height));
    if(ratio){width=Math.min(width,maxHeight*ratio);height=width/ratio;}
    return {x:corner==='nw'?right-width:crop.x,y:corner==='nw'?bottom-height:crop.y,width,height};
}
