/* C/WASM equivalent of ZDecomp::Decompress at original ELF 0x38a1f4.
 * The original function creates a fresh zlib stream per call, returns the
 * produced byte count (including truncated/error prefixes), and leaves its
 * object untouched. Copy input first to preserve its supported in-place use.
 */
#include <unicorn/unicorn.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <zlib.h>
#define OU_DECOMPRESS_LIMIT (512u*1024u*1024u)
int ou_guest_zdecompress(uc_engine *engine,uint32_t source,int32_t input_size,uint32_t destination,int32_t capacity){
 if(input_size<0||capacity<0||(uint32_t)input_size>OU_DECOMPRESS_LIMIT||(uint32_t)capacity>OU_DECOMPRESS_LIMIT)return -1000-UC_ERR_ARG;
 if(destination>=source&&(uint64_t)destination<(uint64_t)source+(uint32_t)input_size)return 0;
 unsigned char *input=malloc(input_size?(size_t)input_size:1),*output=malloc(capacity?(size_t)capacity:1);int result=-1000-UC_ERR_NOMEM;
 if(!input||!output)goto done;
 if(input_size){int error=uc_mem_read(engine,source,input,(size_t)input_size);if(error){result=-1000-error;goto done;}}
 z_stream stream;memset(&stream,0,sizeof(stream));stream.next_in=input;stream.avail_in=(uInt)input_size;stream.next_out=output;stream.avail_out=(uInt)capacity;
 if(inflateInit(&stream)!=Z_OK){result=0;goto done;}
 int status;do{status=inflate(&stream,Z_NO_FLUSH);}while(status==Z_OK);
 const uint32_t produced=(uint32_t)stream.total_out;inflateEnd(&stream);
 if(produced>(uint32_t)capacity){result=-1000-UC_ERR_ARG;goto done;}
 if(produced){int error=uc_mem_write(engine,destination,output,produced);if(error){result=-1000-error;goto done;}}
 result=(int)produced;
 done:free(input);free(output);return result;
}
