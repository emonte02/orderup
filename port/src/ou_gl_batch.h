#ifndef OU_GL_BATCH_H
#define OU_GL_BATCH_H
#include <stdint.h>
typedef struct OUGLBatch OUGLBatch;
/* Validate the three standard void attribute bindings before any mutation. */
int ou_gl_batch_attribute_plan(OUGLBatch *,const uint32_t[3],uint32_t[3],uint32_t);
int ou_gl_batch_append_void(OUGLBatch *,uint32_t,const uint32_t[6]);
#endif
