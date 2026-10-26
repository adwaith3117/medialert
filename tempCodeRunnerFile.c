#include <stdio.h>
#include <stdlib.h>

struct node
{
    char word[50];
    char meaning[100];
    struct node *left;
    struct node *right;
};

int main()
{
    struct node *root = NULL, *temp, *ptr;
    int n, i, j, result;
    char key[50];

    printf("Enter number of words: ");
    scanf("%d", &n);

    for(i = 1; i <= n; i++)
    {
        temp = (struct node *)malloc(sizeof(struct node));

        printf("\nEnter word: ");
        scanf("%s", temp->word);

        printf("Enter meaning: ");
        scanf(" %[^\n]", temp->meaning);

        temp->left = NULL;
        temp->right = NULL;

        if(root == NULL)
        {
            root = temp;
        }
        else
        {
            ptr = root;

            while(1)
            {
                j = 0;

                while(temp->word[j] == ptr->word[j] &&
                      temp->word[j] != '\0')
                {
                    j++;
                }

                if(temp->word[j] < ptr->word[j])
                    result = -1;
                else
                    result = 1;

                if(result < 0)
                {
                    if(ptr->left == NULL)
                    {
                        ptr->left = temp;
                        break;
                    }
                    ptr = ptr->left;
                }
                else
                {
                    if(ptr->right == NULL)
                    {
                        ptr->right = temp;
                        break;
                    }
                    ptr = ptr->right;
                }
            }
        }
    }

    printf("\nEnter word to search: ");
    scanf("%s", key);

    ptr = root;

    while(ptr != NULL)
    {
        j = 0;

        while(key[j] == ptr->word[j] && key[j] != '\0')
        {
            j++;
        }

        if(key[j] == '\0' && ptr->word[j] == '\0')
        {
            printf("Meaning: %s", ptr->meaning);
            return 0;
        }

        if(key[j] < ptr->word[j])
            ptr = ptr->left;
        else
            ptr = ptr->right;
    }

    printf("Word not found");

    return 0;
}