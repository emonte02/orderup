/* WAD v4 recovered from Order Up!! To Go 1.65, libOrderUp.so.
 * Evidence: ValidateHeader 0x39474c; set_entries 0x390638;
 * ValidateEntries 0x392bd0; Crc::GenerateCRCFromString 0x3a4770.
 * Portable C reconstruction, with explicit bounds checks added.
 */
#include "ou_archive.h"
#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include <zlib.h>
#define OU_MAX_ARCHIVE (512u * 1024u * 1024u)
struct ou_wad {
    const unsigned char *disk;
    size_t length;
    unsigned char *inflated;
    uint32_t count, header, alignment, mode, memory_size, disk_size, data_start;
};
static uint32_t u32(const unsigned char *p) {
    return (uint32_t)p[0] | ((uint32_t)p[1]<<8) | ((uint32_t)p[2]<<16) | ((uint32_t)p[3]<<24);
}
static int range(size_t length, size_t offset, size_t size) {
    return offset <= length && size <= length - offset;
}
uint32_t ou_crc(const char *name) {
    uint32_t value=UINT32_MAX;
    if (!name) return value;
    while (*name) {
        unsigned char c=(unsigned char)*name++;
        if(c>='A' && c<='Z') c += 'a'-'A';
        value ^= c;
        for(unsigned j=0;j<8;j++) value=(value>>1) ^ ((0u-(value&1u)) & 0xedb88320u);
    }
    return value;
}
static const unsigned char *entry(const ou_wad *w, uint32_t i) {
    if(!w || i>=w->count) return NULL;
    uint32_t physical=u32(w->disk+48+8*(size_t)i+4);
    return w->disk+48+8*(size_t)w->count+8*(size_t)physical;
}
ou_wad *ou_wad_open(const void *data, size_t length) {
    if(!data || length<48 || length>OU_MAX_ARCHIVE) return NULL;
    const unsigned char *p=data;
    if(memcmp(p,"0DAW",4) || u32(p+4)!=4) return NULL;
    uint32_t n=u32(p+8), h=u32(p+12), a=u32(p+16), mode=u32(p+20);
    uint32_t mem=u32(p+24), disk=u32(p+28);
    uint64_t expected=48ull+(uint64_t)n*(mode==2?24:16);
    if(mode>2 || h!=expected || h>length || a==0 || a>65536 || (a&(a-1)) || mem>OU_MAX_ARCHIVE) return NULL;
    uint64_t start=((uint64_t)h+a-1)&~((uint64_t)a-1);
    if(start>length || (uint64_t)h+mem>OU_MAX_ARCHIVE || !range(length,h,disk)) return NULL;
    ou_wad *w=calloc(1,sizeof(*w)); if(!w) return NULL;
    w->disk=p;w->length=length;w->count=n;w->header=h;w->alignment=a;
    w->mode=mode;w->memory_size=mem;w->disk_size=disk;w->data_start=(uint32_t)start;
    if(mode==1) {
        w->inflated=malloc(mem?mem:1);if(!w->inflated) goto fail;
        uLongf dest=mem;
        if(uncompress(w->inflated,&dest,p+h,(uLong)disk)!=Z_OK || dest!=mem) goto fail;
    }
    unsigned char *seen=calloc(n?n:1,1); if(!seen) goto fail;
    for(uint32_t i=0;i<n;i++) {
        uint32_t ix=u32(p+48+8*(size_t)i+4);
        if(ix>=n || seen[ix] || (i && u32(p+48+8*(size_t)(i-1))>=u32(p+48+8*(size_t)i))) {free(seen);goto fail;}
        seen[ix]=1;
        const unsigned char *e=entry(w,i);
        uint32_t off=u32(e), size=u32(e+4);
        if(size>INT_MAX || off<start || (off%a)!=0 || !range((size_t)h+mem,off,size)) {free(seen);goto fail;}
        if(mode==0 && !range(length,off,size)) {free(seen);goto fail;}
        if(mode==2) {
            const unsigned char *c=e+8*(size_t)n;
            uint32_t co=u32(c),cl=u32(c+4);
            if(co<start || (co%a)!=0 || !range(length,co,cl)) {free(seen);goto fail;}
        }
    }
    free(seen);return w;
fail:
    ou_wad_close(w);return NULL;
}
void ou_wad_close(ou_wad *w) {if(w){free(w->inflated);free(w);}}
uint32_t ou_wad_count(const ou_wad *w) {return w?w->count:0;}
uint32_t ou_wad_mode(const ou_wad *w) {return w?w->mode:0;}
uint32_t ou_wad_hash(const ou_wad *w,uint32_t i) {return w&&i<w->count?u32(w->disk+48+8*(size_t)i):0;}
uint32_t ou_wad_size(const ou_wad *w,uint32_t i) {const unsigned char *e=entry(w,i);return e?u32(e+4):0;}
int ou_wad_find(const ou_wad *w,uint32_t hash) {
    if(!w)return -1;
    uint32_t lo=0,hi=w->count;
    while(lo<hi){uint32_t m=lo+(hi-lo)/2;uint32_t h=ou_wad_hash(w,m);if(h<hash)lo=m+1;else hi=m;}
    return lo<w->count&&ou_wad_hash(w,lo)==hash?(int)lo:-1;
}
int ou_wad_read(const ou_wad *w,uint32_t i,void *out,size_t capacity) {
    const unsigned char *e=entry(w,i);if(!e)return -1;
    uint32_t off=u32(e),size=u32(e+4);
    if(capacity<size || (!out && size))return -1;
    if(size==0)return 0;
    if(w->mode==2) {
        const unsigned char *c=e+8*(size_t)w->count;
        uint32_t co=u32(c),cl=u32(c+4);
        if(cl==size) {memcpy(out,w->disk+co,size);return (int)size;}
        uLongf dest=size;
        if(uncompress(out,&dest,w->disk+co,cl)!=Z_OK || dest!=size)return -1;
    } else memcpy(out,w->mode==1?w->inflated+off-w->header:w->disk+off,size);
    return (int)size;
}
