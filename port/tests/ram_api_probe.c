/* The RAM fast path must retain public Unicorn memory API behavior, including
 * MMIO side effects, protected RAM, mapping boundaries and snapshot CoW. */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unicorn/unicorn.h>
#define CHECK(expr) do { if (!(expr)) return __LINE__; } while (0)
static unsigned reads, writes, last_size;
static uint64_t last_offset, last_value;
static uint64_t mmio_read(uc_engine *uc, uint64_t offset, unsigned size, void *data)
{
    (void)uc;
    reads++; last_offset=offset; last_size=size;
    return *(uint32_t *)data;
}
static void mmio_write(uc_engine *uc, uint64_t offset, unsigned size,
                       uint64_t value, void *data)
{
    (void)uc;
    writes++; last_offset=offset; last_size=size; last_value=value;
    *(uint32_t *)data=(uint32_t)value;
}
int ram_api_probe(void)
{
    uc_engine *uc=NULL; uc_context *context=NULL;
    uint32_t value=0x12345678, result=0, device=0xa1b2c3d4;
    uint8_t before[8], after[8], sentinel[8];
    CHECK(uc_open(UC_ARCH_ARM,UC_MODE_ARM,&uc)==UC_ERR_OK);
    CHECK(uc_mem_map(uc,0x1000,0x2000,UC_PROT_ALL)==UC_ERR_OK);
    CHECK(uc_mem_write(uc,0x1013,&value,4)==UC_ERR_OK);
    CHECK(uc_mem_read(uc,0x1013,&result,4)==UC_ERR_OK && result==value);
    CHECK(uc_mem_protect(uc,0x2000,0x1000,UC_PROT_NONE)==UC_ERR_OK);
    CHECK(uc_mem_write(uc,0x2013,&value,4)==UC_ERR_OK);
    CHECK(uc_mem_read(uc,0x2013,&result,4)==UC_ERR_OK && result==value);
    for (unsigned i=0;i<8;i++) before[i]=(uint8_t)(i+17);
    CHECK(uc_mem_write(uc,0x1ffc,before,8)==UC_ERR_OK);
    CHECK(uc_mem_read(uc,0x1ffc,after,8)==UC_ERR_OK && !memcmp(before,after,8));
    CHECK(uc_mem_unmap(uc,0x2000,0x1000)==UC_ERR_OK);
    memset(sentinel,0xee,8); memcpy(after,sentinel,8);
    CHECK(uc_mem_read(uc,0x1ffc,after,8)==UC_ERR_READ_UNMAPPED);
    CHECK(!memcmp(after,sentinel,8));
    CHECK(uc_mem_write(uc,0x1ffc,sentinel,8)==UC_ERR_WRITE_UNMAPPED);
    CHECK(uc_mem_read(uc,0x1ffc,after,4)==UC_ERR_OK && !memcmp(before,after,4));
    CHECK(uc_mem_read(uc,UINT64_C(0xfffffff0),after,0)==UC_ERR_OK);
    CHECK(uc_mem_write(uc,UINT64_C(0xfffffff0),after,0)==UC_ERR_OK);
    CHECK(uc_mmio_map(uc,0x4000,0x1000,mmio_read,&device,mmio_write,&device)==UC_ERR_OK);
    CHECK(uc_mem_read(uc,0x4010,&result,4)==UC_ERR_OK);
    CHECK(result==device && reads==1 && last_offset==0x10 && last_size==4);
    value=0x98765432;
    CHECK(uc_mem_write(uc,0x4020,&value,4)==UC_ERR_OK);
    CHECK(writes==1 && last_offset==0x20 && last_size==4 && last_value==value && device==value);
    uint8_t *external=malloc(0x1000); CHECK(external);
    CHECK(uc_mem_map_ptr(uc,0x6000,0x1000,UC_PROT_READ,external)==UC_ERR_OK);
    memcpy(external+31,&value,4);
    CHECK(uc_mem_read(uc,0x601f,&result,4)==UC_ERR_OK && result==value);
    value=0xabcdef01;
    CHECK(uc_mem_write(uc,0x6023,&value,4)==UC_ERR_OK);
    CHECK(!memcmp(external+35,&value,4));
    CHECK(uc_close(uc)==UC_ERR_OK); free(external);

    /* Separate engine: memory snapshots must resolve the CoW overlay, then
     * restore the original bytes, rather than reading the old RAMBlock. */
    CHECK(uc_open(UC_ARCH_ARM,UC_MODE_ARM,&uc)==UC_ERR_OK);
    CHECK(uc_mem_map(uc,0x1000,0x2000,UC_PROT_ALL)==UC_ERR_OK);
    value=0x11223344;
    CHECK(uc_mem_write(uc,0x1010,&value,4)==UC_ERR_OK);
    CHECK(uc_ctl_context_mode(uc,UC_CTL_CONTEXT_CPU|UC_CTL_CONTEXT_MEMORY)==UC_ERR_OK);
    CHECK(uc_context_alloc(uc,&context)==UC_ERR_OK);
    CHECK(uc_context_save(uc,context)==UC_ERR_OK);
    value=0x55667788;
    CHECK(uc_mem_write(uc,0x1010,&value,4)==UC_ERR_OK);
    CHECK(uc_mem_read(uc,0x1010,&result,4)==UC_ERR_OK && result==value);
    CHECK(uc_context_restore(uc,context)==UC_ERR_OK);
    CHECK(uc_mem_read(uc,0x1010,&result,4)==UC_ERR_OK && result==0x11223344);
    CHECK(uc_context_free(context)==UC_ERR_OK);
    CHECK(uc_close(uc)==UC_ERR_OK);
    return 0;
}
